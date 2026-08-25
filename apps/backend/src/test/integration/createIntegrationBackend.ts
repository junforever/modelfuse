import type { Pool } from 'pg';

import { createApp } from '../../app.js';
import { DEPLOYMENT_CATALOG } from '../../infrastructure/llm/deploymentCatalog.js';
import { ConversationRepository } from '../../infrastructure/postgres/repositories/conversationRepository.js';
import { ContextRepository } from '../../infrastructure/postgres/repositories/contextRepository.js';
import { TurnRepository } from '../../infrastructure/postgres/repositories/turnRepository.js';
import { ContextBuilder } from '../../services/conversations/ContextBuilder.js';
import { ConversationService } from '../../services/conversations/ConversationService.js';
import { TurnOrchestrator } from '../../services/conversations/TurnOrchestrator.js';
import { TurnEventPublisher } from '../../services/conversations/turnEventPublisher.js';
import { ModelCatalogService } from '../../services/llm/ModelCatalogService.js';
import type { DeploymentDefinition } from '../../types/conversations.js';
import type { ProviderRegistry } from '../../types/llm.js';
import type { ControlledProviders } from './controlledLlmProviders.js';

export function createIntegrationBackend(
  pool: Pool,
  providers: ProviderRegistry | ControlledProviders,
  definitions: readonly DeploymentDefinition[] = DEPLOYMENT_CATALOG
) {
  const providerRegistry = toProviderRegistry(providers);
  const modelCatalogService = new ModelCatalogService(definitions, providerRegistry);
  const conversationRepository = new ConversationRepository(pool);
  const contextRepository = new ContextRepository(pool);
  const turnRepository = new TurnRepository(pool);
  const publisher = new TurnEventPublisher();
  const orchestrator = new TurnOrchestrator({
    turnRepository,
    providerRegistry,
    publisher,
    contextBuilder: new ContextBuilder({ contextRepository, maxTurns: 10, thresholdRatio: 0.8 }),
  });
  const conversationService = new ConversationService({
    conversationRepository,
    turnRepository,
    orchestrator,
    modelCatalogService,
  });

  return {
    app: createApp({
      conversationService,
      turnEventPublisher: publisher,
      providerRegistry,
      modelCatalogService,
    }),
    conversationRepository,
    turnRepository,
    publisher,
    orchestrator,
    conversationService,
    modelCatalogService,
  };
}

function toProviderRegistry(providers: ProviderRegistry | ControlledProviders): ProviderRegistry {
  if (!('base-1' in providers)) return providers;

  return {
    openai: providers['base-1'],
    google: providers['base-2'],
    openrouter: {
      providerId: 'openrouter',
      measureInputTokens: (deployment, messages) => {
        const provider = deployment.slot === 'base-3' ? providers['base-3'] : providers.consolidator;
        return provider.measureInputTokens(deployment, messages);
      },
      generate: request => {
        const provider = request.slot === 'base-3' ? providers['base-3'] : providers.consolidator;
        return provider.generate(request);
      },
    },
  };
}
