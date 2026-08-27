import { describe, expect, it, vi } from 'vitest';

import { DEPLOYMENT_CATALOG } from '../../../infrastructure/llm/deploymentCatalog.js';
import type { ConversationDeploymentSnapshot } from '../../../types/conversations.js';
import type { LlmMessage, LlmProvider } from '../../../types/llm.js';
import { CONTEXT_TRUNCATION_MARKER, protectContext } from '../contextProtection.js';

const systemMessage = { role: 'system' as const, content: 'System instructions' };
const currentPrompt = { role: 'user' as const, content: 'Current prompt must survive' };

function snapshot(
  definition: (typeof DEPLOYMENT_CATALOG)[number],
  maxOutputTokens: number = definition.maxOutputTokens
): ConversationDeploymentSnapshot<'base-1'> {
  const { credentialEnv: _credentialEnv, ...catalogItem } = definition;
  return { ...catalogItem, maxOutputTokens, slot: 'base-1' };
}

function input(
  deployment: ConversationDeploymentSnapshot,
  measureInputTokens: LlmProvider['measureInputTokens'],
  overrides: Partial<{
    historicalTurns: Array<{ ordinal: number; messages: LlmMessage[] }>;
    auxiliaryMessages: LlmMessage[];
    currentOrdinal: number;
  }> = {}
) {
  return {
    systemMessage,
    historicalTurns: [],
    auxiliaryMessages: [],
    currentPrompt,
    currentOrdinal: 1,
    deployment,
    measureInputTokens,
    thresholdRatio: 0.8,
    ...overrides,
  };
}

describe('protectContext', () => {
  it.each(DEPLOYMENT_CATALOG)(
    'uses the exact $deploymentId snapshot limit at the threshold and rejects one token above it',
    async definition => {
      const selectedSnapshot = snapshot(definition);
      const maximumAdmittedTokens = Math.floor(selectedSnapshot.contextLimitTokens * 0.8);
      const atThreshold = vi.fn<LlmProvider['measureInputTokens']>(
        async () => maximumAdmittedTokens
      );
      const aboveThreshold = vi.fn<LlmProvider['measureInputTokens']>(
        async () => maximumAdmittedTokens + 1
      );

      const admitted = await protectContext(input(selectedSnapshot, atThreshold));
      const rejected = await protectContext(input(selectedSnapshot, aboveThreshold));

      expect(admitted).toMatchObject({ ok: true, contextWindow: { protectionApplied: 'none' } });
      expect(rejected).toEqual({
        ok: false,
        error: {
          code: 'INVALID_PROMPT_SIZE',
          message: expect.any(String),
          recoverable: false,
        },
      });
      expect(atThreshold).toHaveBeenCalledWith(selectedSnapshot, [systemMessage, currentPrompt]);
      expect(aboveThreshold).toHaveBeenCalledWith(selectedSnapshot, [systemMessage, currentPrompt]);
    }
  );

  it('drops oldest whole turns before truncating auxiliary context and awaits every remeasurement', async () => {
    const selectedSnapshot = snapshot(DEPLOYMENT_CATALOG[0], 1);
    const auxiliary = { role: 'assistant' as const, content: 'A'.repeat(80) };
    const measuredPayloads: LlmMessage[][] = [];
    const tokenCounts = [500_000, 450_000, 400_000];
    const measureInputTokens = vi.fn<LlmProvider['measureInputTokens']>(
      async (_deployment, messages) => {
        measuredPayloads.push(messages.map(message => ({ ...message })));
        return tokenCounts[measuredPayloads.length - 1]!;
      }
    );

    const result = await protectContext(
      input(selectedSnapshot, measureInputTokens, {
        historicalTurns: [
          {
            ordinal: 1,
            messages: [
              { role: 'user', content: 'Old prompt' },
              { role: 'assistant', content: 'Old answer' },
            ],
          },
        ],
        auxiliaryMessages: [auxiliary],
        currentOrdinal: 2,
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(measureInputTokens).toHaveBeenCalledTimes(3);
    expect(measuredPayloads[1]?.map(({ content }) => content)).not.toContain('Old prompt');
    expect(measuredPayloads[1]).toContainEqual(auxiliary);
    expect(measuredPayloads[2]).toContainEqual({
      role: auxiliary.role,
      content: expect.stringContaining(CONTEXT_TRUNCATION_MARKER),
    });
    expect(result.messages.at(-1)).toEqual(currentPrompt);
    expect(result.contextWindow).toEqual({
      truncated: true,
      firstIncludedOrdinal: 2,
      lastIncludedOrdinal: 2,
      protectionApplied: 'turn-window-and-truncate',
    });
  });

  it('keeps admission and auxiliary truncation identical when only maxOutputTokens changes', async () => {
    const definition = DEPLOYMENT_CATALOG[1];
    const lowOutputSnapshot = snapshot(definition, 1);
    const highOutputSnapshot = snapshot(definition, 999_999);

    const exercise = async (deployment: ConversationDeploymentSnapshot) => {
      const tokenCounts = [170_000, 150_000];
      const measureInputTokens = vi.fn<LlmProvider['measureInputTokens']>(async () =>
        tokenCounts.shift()!
      );
      const result = await protectContext(
        input(deployment, measureInputTokens, {
          auxiliaryMessages: [{ role: 'user', content: 'base-1:\nLong auxiliary answer' }],
        })
      );
      return { result, measureInputTokens };
    };

    const lowOutput = await exercise(lowOutputSnapshot);
    const highOutput = await exercise(highOutputSnapshot);

    expect(lowOutput.result).toEqual(highOutput.result);
    expect(lowOutput.result).toMatchObject({
      ok: true,
      contextWindow: { truncated: true, protectionApplied: 'truncate' },
    });
    expect(lowOutput.measureInputTokens).toHaveBeenCalledTimes(2);
    expect(highOutput.measureInputTokens).toHaveBeenCalledTimes(2);
  });
});
