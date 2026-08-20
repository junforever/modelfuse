import type { Pool } from 'pg';

import { createApp } from '../../app.js';
import { ConversationRepository } from '../../infrastructure/postgres/repositories/conversationRepository.js';
import { ContextRepository } from '../../infrastructure/postgres/repositories/contextRepository.js';
import { TurnRepository } from '../../infrastructure/postgres/repositories/turnRepository.js';
import { ContextBuilder } from '../../services/conversations/ContextBuilder.js';
import { ConversationService } from '../../services/conversations/ConversationService.js';
import { TurnOrchestrator } from '../../services/conversations/TurnOrchestrator.js';
import { TurnEventPublisher } from '../../services/conversations/turnEventPublisher.js';
import type { ControlledProviders } from './controlledLlmProviders.js';

export function createIntegrationBackend(
  pool: Pool,
  providers: ControlledProviders
) {
  const conversationRepository = new ConversationRepository(pool);
  const contextRepository = new ContextRepository(pool);
  const turnRepository = new TurnRepository(pool);
  const publisher = new TurnEventPublisher();
  const orchestrator = new TurnOrchestrator({
    turnRepository,
    providerRegistry: providers,
    publisher,
    contextBuilder: new ContextBuilder({ contextRepository, maxTurns: 10, thresholdRatio: 0.8 }),
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
