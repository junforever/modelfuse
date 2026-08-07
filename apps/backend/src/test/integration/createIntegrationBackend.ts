import type { Pool } from 'pg';

import { createApp } from '../../app.js';
import { ConversationRepository } from '../../infrastructure/postgres/repositories/conversationRepository.js';
import { TurnRepository } from '../../infrastructure/postgres/repositories/turnRepository.js';
import { ConversationService } from '../../services/conversations/ConversationService.js';
import { TurnOrchestrator } from '../../services/conversations/TurnOrchestrator.js';
import { TurnEventPublisher } from '../../services/conversations/turnEventPublisher.js';
import type { ResponseSlot } from '../../types/conversations.js';
import type { ControlledLlmProvider } from './controlledLlmProviders.js';

export function createIntegrationBackend(
  pool: Pool,
  providers: Record<ResponseSlot, ControlledLlmProvider>
) {
  const conversationRepository = new ConversationRepository(pool);
  const turnRepository = new TurnRepository(pool);
  const publisher = new TurnEventPublisher();
  const orchestrator = new TurnOrchestrator({
    turnRepository,
    providerRegistry: providers,
    publisher,
  });
  const conversationService = new ConversationService({
    conversationRepository,
    turnRepository,
    orchestrator,
  });

  return {
    app: createApp({ conversationService, turnEventPublisher: publisher }),
    conversationRepository,
    turnRepository,
    publisher,
    orchestrator,
    conversationService,
  };
}
