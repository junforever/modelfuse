import { Server } from 'node:http';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('backend application lifecycle', () => {
  it('returns a client-safe JSON error through the real Express middleware', async () => {
    const { createApp } = await import('../app.js');

    const response = await request(createApp())
      .post('/api/v1/conversations')
      .set('content-type', 'application/json')
      .send('{"secret":"must-not-leak",');

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      code: 'INVALID_JSON',
      message: expect.any(String),
      requestId: expect.any(String),
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /must-not-leak|SyntaxError|stack|apps[\\/]backend/i
    );
  });

  it('keeps module imports passive and delegates listening to start/stop', async () => {
    vi.resetModules();
    const listenSpy = vi.spyOn(Server.prototype, 'listen');
    const originalSigintListeners = new Set(process.listeners('SIGINT'));
    const originalSigtermListeners = new Set(process.listeners('SIGTERM'));

    const { createApp } = await import('../app.js');
    const { startServer, stopServer } = await import('../server.js');
    await import('../index.js');

    expect(createApp).toBeTypeOf('function');
    expect(listenSpy).not.toHaveBeenCalled();

    let server: Server | undefined;
    try {
      server = await startServer(0);
      expect(server.listening).toBe(true);
      expect(listenSpy).toHaveBeenCalledOnce();

      await stopServer(server);
      expect(server.listening).toBe(false);
    } finally {
      if (server?.listening) {
        await stopServer(server);
      }

      for (const listener of process.listeners('SIGINT')) {
        if (!originalSigintListeners.has(listener)) {
          process.removeListener('SIGINT', listener);
        }
      }
      for (const listener of process.listeners('SIGTERM')) {
        if (!originalSigtermListeners.has(listener)) {
          process.removeListener('SIGTERM', listener);
        }
      }
    }
  });
});
