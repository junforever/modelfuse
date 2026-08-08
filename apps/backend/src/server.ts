import type { Server } from 'node:http';

import { createApp } from './app.js';
import { parseEnv, type Environment } from './infrastructure/config/env.js';
import type { ApiDependencies } from './routes/apiRouter.js';

function resolvePort(port: number | undefined): number {
  const resolvedPort = port ?? Number(process.env.PORT ?? 3001);

  if (!Number.isInteger(resolvedPort) || resolvedPort < 0 || resolvedPort > 65_535) {
    throw new Error('Invalid server configuration: PORT');
  }

  return resolvedPort;
}

export async function startServer(port?: number): Promise<Server> {
  let dependencies: ApiDependencies | undefined;
  if (process.env.NODE_ENV !== 'test') {
    const environment = parseEnv(process.env);
    dependencies = await createProductionDependencies(environment);
  }

  const server = createApp(dependencies).listen(resolvePort(port));

  return new Promise<Server>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolve(server);
    };

    server.once('error', onError);
    server.once('listening', onListening);
  });
}

async function createProductionDependencies(environment: Environment): Promise<ApiDependencies> {
  const [poolModule, registryModule, repositoryModule, contextRepositoryModule, turnRepositoryModule, publisherModule, contextBuilderModule, orchestratorModule, serviceModule] =
    await Promise.all([
      import('./infrastructure/postgres/postgresPool.js'),
      import('./infrastructure/llm/providerRegistry.js'),
      import('./infrastructure/postgres/repositories/conversationRepository.js'),
      import('./infrastructure/postgres/repositories/contextRepository.js'),
      import('./infrastructure/postgres/repositories/turnRepository.js'),
      import('./services/conversations/turnEventPublisher.js'),
      import('./services/conversations/ContextBuilder.js'),
      import('./services/conversations/TurnOrchestrator.js'),
      import('./services/conversations/ConversationService.js'),
    ]);
  const conversationRepository = new repositoryModule.ConversationRepository(poolModule.postgresPool);
  const contextRepository = new contextRepositoryModule.ContextRepository(poolModule.postgresPool);
  const turnRepository = new turnRepositoryModule.TurnRepository(poolModule.postgresPool);
  const turnEventPublisher = new publisherModule.TurnEventPublisher();
  const orchestrator = new orchestratorModule.TurnOrchestrator({
    providerRegistry: registryModule.providerRegistry,
    turnRepository,
    publisher: turnEventPublisher,
    contextBuilder: new contextBuilderModule.ContextBuilder({
      contextRepository,
      maxTurns: environment.CONVERSATION_CONTEXT_MAX_TURNS,
      thresholdRatio: environment.LLM_CONTEXT_THRESHOLD_RATIO,
    }),
  });
  const conversationService = new serviceModule.ConversationService({
    conversationRepository,
    turnRepository,
    orchestrator,
    sidebarPageSize: environment.CONVERSATION_SIDEBAR_PAGE_SIZE,
  });
  return { conversationService, turnEventPublisher };
}

export async function stopServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
