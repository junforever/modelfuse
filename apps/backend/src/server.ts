import type { Server } from 'node:http';

import { createApp } from './app.js';
import { parseEnv } from './infrastructure/config/env.js';

function resolvePort(port: number | undefined): number {
  const resolvedPort = port ?? Number(process.env.PORT ?? 3001);

  if (!Number.isInteger(resolvedPort) || resolvedPort < 0 || resolvedPort > 65_535) {
    throw new Error('Invalid server configuration: PORT');
  }

  return resolvedPort;
}

export async function startServer(port?: number): Promise<Server> {
  if (process.env.NODE_ENV !== 'test') {
    parseEnv(process.env);
  }

  const server = createApp().listen(resolvePort(port));

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
