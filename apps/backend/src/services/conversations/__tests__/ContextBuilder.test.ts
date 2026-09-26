import { describe, expect, it, vi } from 'vitest';

import type { ConversationDeploymentSnapshot, ResponseSlot } from '../../../types/conversations.js';
import type { LlmMessage, LlmProvider } from '../../../types/llm.js';
import { CONTEXT_TRUNCATION_MARKER } from '../contextProtection.js';
import { ContextBuilder } from '../ContextBuilder.js';

function deployment<Slot extends ResponseSlot>(
  slot: Slot,
  overrides: Partial<ConversationDeploymentSnapshot<Slot>> = {}
): ConversationDeploymentSnapshot<Slot> {
  return {
    slot,
    deploymentId: `deployment-${slot}`,
    providerId: 'openrouter',
    modelId: `model-${slot}`,
    displayName: `Deployment ${slot}`,
    supportsWebSearch: true,
    contextLimitTokens: 100,
    maxOutputTokens: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    ...overrides,
  };
}

describe('ContextBuilder', () => {
  it('uses only the requested conversation and base-slot history with the async adapter measurement', async () => {
    const selectedDeployment = deployment('base-2');
    const contextRepository = {
      getBaseContext: vi.fn(async () => [
        { ordinal: 1, prompt: 'First prompt', response: 'Base-2 first answer' },
        { ordinal: 2, prompt: 'Second prompt', response: null },
      ]),
      getConsolidatorContext: vi.fn(),
    };
    const measureInputTokens = vi.fn<LlmProvider['measureInputTokens']>(async () => 1);
    const builder = new ContextBuilder({
      contextRepository,
      maxTurns: 2,
      thresholdRatio: 0.8,
    });

    const result = await builder.build({
      conversationId: 'conversation-a',
      currentOrdinal: 3,
      prompt: 'Follow up',
      deployment: selectedDeployment,
      measureInputTokens,
    });

    expect(contextRepository.getBaseContext).toHaveBeenCalledWith({
      conversationId: 'conversation-a',
      beforeOrdinal: 3,
      slot: 'base-2',
      maxTurns: 2,
    });
    expect(contextRepository.getConsolidatorContext).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      messages: [
        expect.objectContaining({ role: 'system' }),
        { role: 'user', content: 'First prompt' },
        { role: 'assistant', content: 'Base-2 first answer' },
        { role: 'user', content: 'Second prompt' },
        { role: 'user', content: 'Follow up' },
      ],
      contextWindow: {
        truncated: false,
        firstIncludedOrdinal: 1,
        lastIncludedOrdinal: 3,
        protectionApplied: 'none',
      },
    });
    expect(measureInputTokens).toHaveBeenCalledOnce();
    expect(measureInputTokens.mock.calls[0]?.[0]).toBe(selectedDeployment);
    expect(measureInputTokens.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining([
        { role: 'assistant', content: 'Base-2 first answer' },
        { role: 'user', content: 'Follow up' },
      ])
    );
  });

  it('isolates consolidator history, drops old turns before auxiliary answers, and remeasures every reduction', async () => {
    const measuredPayloads: LlmMessage[][] = [];
    const tokenCounts = [120, 100, 70];
    const measureInputTokens = vi.fn<LlmProvider['measureInputTokens']>(
      async (_deployment, messages) => {
        measuredPayloads.push(messages.map(message => ({ ...message })));
        return tokenCounts[measuredPayloads.length - 1]!;
      }
    );
    const contextRepository = {
      getBaseContext: vi.fn(),
      getConsolidatorContext: vi.fn(async () => [
        { ordinal: 4, prompt: 'Prior prompt', response: 'Prior consolidation' },
      ]),
    };
    const builder = new ContextBuilder({
      contextRepository,
      maxTurns: 3,
      thresholdRatio: 0.8,
    });

    const result = await builder.build({
      conversationId: 'conversation-consolidator',
      currentOrdinal: 5,
      prompt: 'Current prompt',
      currentBaseResponses: [
        { slot: 'base-1', content: 'Current base-1 answer' },
        { slot: 'base-2', content: 'Current base-2 answer' },
        { slot: 'base-3', content: null },
      ],
      deployment: deployment('consolidator'),
      measureInputTokens,
    });

    expect(contextRepository.getConsolidatorContext).toHaveBeenCalledWith({
      conversationId: 'conversation-consolidator',
      beforeOrdinal: 5,
      maxTurns: 3,
    });
    expect(contextRepository.getBaseContext).not.toHaveBeenCalled();
    expect(measureInputTokens).toHaveBeenCalledTimes(3);
    expect(measuredPayloads[0]).toEqual(
      expect.arrayContaining([
        { role: 'user', content: 'Prior prompt' },
        { role: 'assistant', content: 'Prior consolidation' },
        expect.objectContaining({ content: expect.stringContaining('Current base-1 answer') }),
        expect.objectContaining({ content: expect.stringContaining('Current base-2 answer') }),
        expect.objectContaining({ content: expect.stringContaining('[unavailable]') }),
        { role: 'user', content: 'Current prompt' },
      ])
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.messages.at(-1)).toEqual({ role: 'user', content: 'Current prompt' });
    expect(result.messages.map(({ content }) => content)).not.toContain('Prior prompt');
    expect(result.messages.some(({ content }) => content.includes(CONTEXT_TRUNCATION_MARKER))).toBe(
      true
    );
    expect(result.contextWindow).toEqual({
      truncated: true,
      firstIncludedOrdinal: 5,
      lastIncludedOrdinal: 5,
      protectionApplied: 'turn-window-and-truncate',
    });
  });

  it('keeps concurrent conversations isolated and admits each from its stored snapshot limit', async () => {
    const narrowSnapshot = deployment('base-1', {
      deploymentId: 'narrow-snapshot',
      contextLimitTokens: 100,
      maxOutputTokens: 99_999,
    });
    const wideSnapshot = deployment('base-3', {
      deploymentId: 'wide-snapshot',
      contextLimitTokens: 200,
      maxOutputTokens: 1,
    });
    const contextRepository = {
      getBaseContext: vi.fn(async () => []),
      getConsolidatorContext: vi.fn(),
    };
    const measureInputTokens = vi.fn<LlmProvider['measureInputTokens']>(async () => 81);
    const builder = new ContextBuilder({
      contextRepository,
      maxTurns: 2,
      thresholdRatio: 0.8,
    });

    const [narrowResult, wideResult] = await Promise.all([
      builder.build({
        conversationId: 'conversation-narrow',
        currentOrdinal: 1,
        prompt: 'Narrow prompt',
        deployment: narrowSnapshot,
        measureInputTokens,
      }),
      builder.build({
        conversationId: 'conversation-wide',
        currentOrdinal: 1,
        prompt: 'Wide prompt',
        deployment: wideSnapshot,
        measureInputTokens,
      }),
    ]);

    expect(narrowResult).toMatchObject({ ok: false, error: { code: 'INVALID_PROMPT_SIZE' } });
    expect(wideResult).toMatchObject({
      ok: true,
      messages: expect.arrayContaining([{ role: 'user', content: 'Wide prompt' }]),
    });
    expect(contextRepository.getBaseContext).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conversation-narrow', slot: 'base-1' })
    );
    expect(contextRepository.getBaseContext).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conversation-wide', slot: 'base-3' })
    );
    expect(measureInputTokens.mock.calls.map(([snapshot]) => snapshot)).toEqual(
      expect.arrayContaining([narrowSnapshot, wideSnapshot])
    );
  });
});
