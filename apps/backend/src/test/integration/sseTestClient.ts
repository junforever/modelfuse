import type { Express } from 'express';
import { createServer, type Server } from 'node:http';

export interface ParsedSseEvent {
  event: string;
  data: Record<string, unknown>;
}

export async function openSse(app: Express, path: string) {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected an ephemeral TCP address');

  const abort = new AbortController();
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    signal: AbortSignal.any([abort.signal, AbortSignal.timeout(5_000)]),
  });
  const body = response.body;
  if (!body) throw new Error('Expected SSE response body');
  const reader = body.getReader();

  let buffer = '';
  const decoder = new TextDecoder();

  async function nextEvent(): Promise<ParsedSseEvent | null> {
    while (true) {
      const boundary = buffer.indexOf('\n\n');
      if (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseBlock(block);
        if (parsed) return parsed;
      }

      const chunk = await reader.read();
      if (chunk.done) return null;
      buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
    }
  }

  async function close(): Promise<void> {
    abort.abort();
    await reader.cancel().catch(() => undefined);
    await closeServer(server);
  }

  return { response, nextEvent, close, server };
}

export async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

function parseBlock(block: string): ParsedSseEvent | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trimStart();
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (data.length === 0) return null;
  return { event, data: JSON.parse(data.join('\n')) as Record<string, unknown> };
}
