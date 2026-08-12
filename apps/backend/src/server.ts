import type { Server } from 'node:http';
import type { Pool } from 'pg';

import { createApp } from './app.js';
import { parseEnv, type Environment } from './infrastructure/config/env.js';
import type { ApiDependencies } from './routes/apiRouter.js';
import type { ResponseSlot } from './types/conversations.js';
import type { LlmProvider } from './types/llm.js';
import type { ConversationService } from './services/conversations/ConversationService.js';
import { recoverInterruptedTurns } from './services/conversations/recoverInterruptedTurns.js';

interface ProductionResources {
  dependencies: ApiDependencies;
  pool: Pool;
  conversationService: ConversationService;
}

const lifecycles = new WeakMap<Server, ProductionResources>();

function resolvePort(port: number | undefined, environment?: Environment): number {
  const resolvedPort = port ?? environment?.PORT ?? 3001;

  if (!Number.isInteger(resolvedPort) || resolvedPort < 0 || resolvedPort > 65_535) {
    throw new Error('Invalid server configuration: PORT');
  }

  return resolvedPort;
}

export async function startServer(port?: number): Promise<Server> {
  let environment: Environment | undefined;
  if (process.env.NODE_ENV !== 'test') {
    environment = parseEnv(process.env);
  }
  const resolvedPort = resolvePort(port, environment);
  const resources = environment
    ? await createProductionDependencies(environment)
    : undefined;

  const server = createApp(resources?.dependencies, environment).listen(resolvedPort);

  try {
    await waitUntilListening(server);
  } catch (error) {
    if (resources) return closePoolAfterFailure(resources.pool, error);
    throw error;
  }
  if (resources) lifecycles.set(server, resources);
  return server;
}

function waitUntilListening(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
  });
}

async function createProductionDependencies(environment: Environment): Promise<ProductionResources> {
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
  const poolFactory = poolModule as unknown as {
    createPostgresPool?: (configuration: Environment) => Pool;
    postgresPool?: Pool;
  };
  const pool = poolFactory.createPostgresPool?.(environment) ?? poolFactory.postgresPool;
  if (!pool) throw new Error('PostgreSQL pool is unavailable.');

  try {
    const providerRegistry = (registryModule as unknown as {
      providerRegistry?: Record<ResponseSlot, LlmProvider>;
    }).providerRegistry;
    if (!providerRegistry) throw new Error('LLM provider registry is unavailable.');

    const conversationRepository = new repositoryModule.ConversationRepository(pool);
    const contextRepository = new contextRepositoryModule.ContextRepository(pool);
    const turnRepository = new turnRepositoryModule.TurnRepository(pool);
    const turnEventPublisher = new publisherModule.TurnEventPublisher();
    const orchestrator = new orchestratorModule.TurnOrchestrator({
      providerRegistry,
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
    await recoverInterruptedTurns(pool);
    return {
      dependencies: { conversationService, turnEventPublisher },
      pool,
      conversationService,
    };
  } catch (error) {
    return closePoolAfterFailure(pool, error);
  }
}

async function closePoolAfterFailure(pool: Pool, error: unknown): Promise<never> {
  try {
    await pool.end();
  } catch {
    // Preserve the setup/listen failure that initiated cleanup.
  }
  throw error;
}

export async function stopServer(server: Server): Promise<void> {
  const lifecycle = lifecycles.get(server);
  let failure: unknown;

  if (server.listening) {
    try {
      await closeServer(server);
    } catch (error) {
      failure = error;
    }
  }

  try {
    await lifecycle?.conversationService.stop();
  } catch (error) {
    failure ??= error;
  }
  try {
    await lifecycle?.pool.end();
  } catch (error) {
    failure ??= error;
  }
  if (lifecycle) lifecycles.delete(server);
  if (failure) throw failure;
}

function closeServer(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
