import { CanceledError, isCancel, type AxiosAdapter } from 'axios';
import { describe, expect, it } from 'vitest';

import { createApiClient } from '../client';

describe('conversation API client', () => {
  it('builds endpoint URLs under the configured API base URL', () => {
    const client = createApiClient({ baseURL: 'https://api.example.test/api/v1' });

    expect(client.getUri({ url: '/conversations' })).toBe(
      'https://api.example.test/api/v1/conversations'
    );
  });

  it('forwards AbortSignal cancellation to its Axios transport', async () => {
    const adapter: AxiosAdapter = config =>
      new Promise((_resolve, reject) => {
        config.signal?.addEventListener(
          'abort',
          () => reject(new CanceledError(undefined, config)),
          { once: true }
        );
      });
    const client = createApiClient({ baseURL: 'https://api.example.test/api/v1', adapter });
    const controller = new AbortController();

    const request = client.get('/conversations', { signal: controller.signal });
    controller.abort();

    await expect(request).rejects.toSatisfy(isCancel);
  });
});
