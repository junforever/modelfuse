import { describe, expect, it, vi } from 'vitest';

import type { LlmContextCapabilities, LlmMessage } from '../../../types/llm.js';
import { CONTEXT_TRUNCATION_MARKER } from '../contextProtection.js';
import { ContextBuilder } from '../ContextBuilder.js';

const exactContext = (
  measureInputTokens: LlmContextCapabilities['measureInputTokens'] = () => ({
    kind: 'exact',
    tokens: 1,
  }),
): LlmContextCapabilities => ({ limitTokens: 100, measureInputTokens });

describe('ContextBuilder', () => {
  it('composes a base slot from only its bounded repository projection', async () => {
    const contextRepository = {
      getBaseContext: vi.fn(async () => [
        { ordinal: 1, prompt: 'First prompt', response: 'OpenAI first answer' },
        { ordinal: 2, prompt: 'Second prompt', response: null },
      ]),
      getQwenContext: vi.fn(),
    };
    const builder = new ContextBuilder({
      contextRepository,
      maxTurns: 2,
      thresholdRatio: 0.8,
    });

    const result = await builder.build({
      conversationId: 'conversation-1',
      slot: 'openai',
      currentOrdinal: 3,
      prompt: 'Follow up',
      context: exactContext(),
    });

    expect(contextRepository.getBaseContext).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      beforeOrdinal: 3,
      slot: 'openai',
      maxTurns: 2,
    });
    expect(contextRepository.getQwenContext).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      messages: [
        expect.objectContaining({ role: 'system' }),
        { role: 'user', content: 'First prompt' },
        { role: 'assistant', content: 'OpenAI first answer' },
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
  });

  it('composes Qwen context, drops old turns before auxiliary answers, and re-measures each reduction', async () => {
    const measuredPayloads: LlmMessage[][] = [];
    const tokenCounts = [120, 100, 70];
    const measureInputTokens = vi.fn<LlmContextCapabilities['measureInputTokens']>(messages => {
      measuredPayloads.push(messages.map(message => ({ ...message })));
      return {
        kind: 'upper_bound',
        tokens: tokenCounts[measuredPayloads.length - 1]!,
        basis: 'controlled test bound',
      };
    });
    const contextRepository = {
      getBaseContext: vi.fn(),
      getQwenContext: vi.fn(async () => [
        { ordinal: 4, prompt: 'Prior prompt', response: 'Prior Qwen consolidation' },
      ]),
    };
    const builder = new ContextBuilder({
      contextRepository,
      maxTurns: 3,
      thresholdRatio: 0.8,
    });

    const result = await builder.build({
      conversationId: 'conversation-1',
      slot: 'qwen',
      currentOrdinal: 5,
      prompt: 'Current prompt',
      currentBaseResponses: [
        { slot: 'openai', content: 'Current OpenAI answer' },
        { slot: 'google', content: 'Current Google answer' },
        { slot: 'minimax', content: null },
      ],
      context: exactContext(measureInputTokens),
    });

    expect(contextRepository.getQwenContext).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      beforeOrdinal: 5,
      maxTurns: 3,
    });
    expect(contextRepository.getBaseContext).not.toHaveBeenCalled();
    expect(measureInputTokens).toHaveBeenCalledTimes(3);
    expect(measuredPayloads[0]).toEqual(
      expect.arrayContaining([
        { role: 'user', content: 'Prior prompt' },
        { role: 'assistant', content: 'Prior Qwen consolidation' },
        expect.objectContaining({ content: expect.stringContaining('Current OpenAI answer') }),
        expect.objectContaining({ content: expect.stringContaining('Current Google answer') }),
        expect.objectContaining({ content: expect.stringMatching(/minimax/i) }),
        { role: 'user', content: 'Current prompt' },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.messages.at(-1)).toEqual({ role: 'user', content: 'Current prompt' });
    expect(result.messages.map(({ content }) => content)).not.toContain('Prior prompt');
    expect(result.messages.some(({ content }) => content.includes(CONTEXT_TRUNCATION_MARKER))).toBe(
      true,
    );
    expect(result.contextWindow).toEqual({
      truncated: true,
      firstIncludedOrdinal: 5,
      lastIncludedOrdinal: 5,
      protectionApplied: 'turn-window-and-truncate',
    });
  });

  it('returns INVALID_PROMPT_SIZE when the required prompt cannot fit', async () => {
    const measureInputTokens = vi.fn<LlmContextCapabilities['measureInputTokens']>(() => ({
      kind: 'exact',
      tokens: 81,
    }));
    const builder = new ContextBuilder({
      contextRepository: {
        getBaseContext: vi.fn(async () => []),
        getQwenContext: vi.fn(),
      },
      maxTurns: 2,
      thresholdRatio: 0.8,
    });

    const result = await builder.build({
      conversationId: 'conversation-1',
      slot: 'google',
      currentOrdinal: 1,
      prompt: 'Required prompt',
      context: exactContext(measureInputTokens),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'INVALID_PROMPT_SIZE',
        message: expect.any(String),
        recoverable: false,
      },
    });
    expect(measureInputTokens).toHaveBeenCalledOnce();
    expect(measureInputTokens.mock.calls[0]?.[0].at(-1)).toEqual({
      role: 'user',
      content: 'Required prompt',
    });
  });
});
