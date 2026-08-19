import { describe, expect, it, vi } from 'vitest';

import type { LlmContextCapabilities } from '../../../types/llm.js';
import {
  CONTEXT_TRUNCATION_MARKER,
  protectContext,
} from '../contextProtection.js';

const systemMessage = { role: 'system' as const, content: 'System instructions' };
const currentPrompt = { role: 'user' as const, content: 'Current prompt must survive' };

describe('protectContext', () => {
  it('keeps a payload that already fits and measures it once', () => {
    const measureInputTokens = vi.fn(() => ({ kind: 'exact' as const, tokens: 60 }));

    const result = protectContext({
      systemMessage,
      historicalTurns: [
        {
          ordinal: 1,
          messages: [
            { role: 'user', content: 'Earlier prompt' },
            { role: 'assistant', content: 'Earlier answer' },
          ],
        },
      ],
      auxiliaryMessages: [],
      currentPrompt,
      currentOrdinal: 2,
      context: { limitTokens: 100, measureInputTokens },
      thresholdRatio: 0.8,
    });

    expect(result).toEqual({
      ok: true,
      messages: [
        systemMessage,
        { role: 'user', content: 'Earlier prompt' },
        { role: 'assistant', content: 'Earlier answer' },
        currentPrompt,
      ],
      contextWindow: {
        truncated: false,
        firstIncludedOrdinal: 1,
        lastIncludedOrdinal: 2,
        protectionApplied: 'none',
      },
    });
    expect(measureInputTokens).toHaveBeenCalledOnce();
  });

  it('drops oldest whole turns before truncating auxiliary context and re-measures every reduction', () => {
    const auxiliary = { role: 'assistant' as const, content: 'A'.repeat(80) };
    const measuredPayloads: Array<Array<{ role: string; content: string }>> = [];
    const tokenCounts = [95, 85, 70];
    const measureInputTokens = vi.fn((messages: Array<{ role: string; content: string }>) => {
      measuredPayloads.push(messages.map((message) => ({ ...message })));
      return { kind: 'upper_bound' as const, tokens: tokenCounts[measuredPayloads.length - 1]!, basis: 'test bound' };
    });

    const result = protectContext({
      systemMessage,
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
      currentPrompt,
      currentOrdinal: 2,
      context: { limitTokens: 100, measureInputTokens },
      thresholdRatio: 0.8,
    });

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

  it('returns the safe slot error when even the required payload cannot fit', () => {
    const measureInputTokens = vi.fn<LlmContextCapabilities['measureInputTokens']>(() => ({
      kind: 'exact',
      tokens: 81,
    }));

    const result = protectContext({
      systemMessage,
      historicalTurns: [],
      auxiliaryMessages: [],
      currentPrompt,
      currentOrdinal: 1,
      context: { limitTokens: 100, measureInputTokens },
      thresholdRatio: 0.8,
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
    expect(measureInputTokens.mock.calls[0]?.[0].at(-1)).toEqual(currentPrompt);
  });
});
