import { describe, expect, it, vi } from 'vitest';

import type { ConversationRepository } from '../../../infrastructure/postgres/repositories/conversationRepository.js';
import type {
  StoredTurnSnapshot,
  TurnRepository,
} from '../../../infrastructure/postgres/repositories/turnRepository.js';
import { createConversationFixture } from '../../../test/fixtures/conversationFixtures.js';
import { ConversationService } from '../ConversationService.js';
import type { TurnOrchestrator } from '../TurnOrchestrator.js';

const logSink = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('../../../utils/logger.js', () => ({
  logger: { error: logSink.error, info: vi.fn(), warn: vi.fn() },
}));

describe('ConversationService background execution', () => {
  it('logs an orchestration rejection with safe identifiers and no prompt or error detail', async () => {
    const snapshot = createConversationFixture() as StoredTurnSnapshot;
    snapshot.turn.prompt = 'prompt-canary-must-not-leak';
    const conversationRepository = {
      createTurn: vi.fn(async () => ({
        kind: 'created' as const,
        conversationId: snapshot.conversation.id,
        turnId: snapshot.turn.id,
      })),
    } as unknown as ConversationRepository;
    const turnRepository = {
      getTurnSnapshot: vi.fn(async () => snapshot),
    } as unknown as TurnRepository;
    const orchestrator = {
      responseDefinitions: [],
      executeTurn: vi.fn().mockRejectedValue(new Error('provider-secret-must-not-leak')),
    } as unknown as TurnOrchestrator;
    const service = new ConversationService({
      conversationRepository,
      turnRepository,
      orchestrator,
    });

    await service.createTurn(snapshot.conversation.id, {
      clientRequestId: snapshot.turn.clientRequestId,
      prompt: snapshot.turn.prompt,
    });
    await vi.waitFor(() => expect(logSink.error).toHaveBeenCalledOnce());

    const logged = logSink.error.mock.calls[0]?.[0];
    expect(logged).toEqual(expect.objectContaining({
      conversationId: snapshot.conversation.id,
      turnId: snapshot.turn.id,
    }));
    expect(JSON.stringify(logged)).not.toContain(snapshot.turn.prompt);
    expect(JSON.stringify(logged)).not.toContain('provider-secret-must-not-leak');
  });
});
