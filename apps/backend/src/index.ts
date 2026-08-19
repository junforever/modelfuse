import { pathToFileURL } from 'node:url';

import { startServer, stopServer } from './server.js';

async function main(): Promise<void> {
  const server = await startServer();
  let stopping = false;

  const shutdown = (): void => {
    if (stopping) {
      return;
    }

    stopping = true;
    void stopServer(server).catch(() => {
      console.error('Server shutdown failed.');
      process.exitCode = 1;
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

const entrypoint = process.argv[1];

if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Server startup failed.');
    process.exitCode = 1;
  });
}
