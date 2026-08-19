import { describe, expect, it } from 'vitest';

import { parseFrontendEnv } from '../env';

describe('frontend environment', () => {
  it('parses the API URL and treats a blank history threshold as unset', () => {
    expect(
      parseFrontendEnv({
        VITE_API_BASE_URL: 'https://api.example.test/api/v1',
        VITE_HISTORY_COLLAPSE_CHAR_THRESHOLD: '',
      })
    ).toEqual({
      apiBaseUrl: 'https://api.example.test/api/v1',
      historyCollapseCharThreshold: undefined,
    });
  });

  it('rejects invalid URLs and non-positive or fractional history thresholds', () => {
    const invalidEnvironments = [
      { VITE_API_BASE_URL: '/api/v1', VITE_HISTORY_COLLAPSE_CHAR_THRESHOLD: '' },
      {
        VITE_API_BASE_URL: 'https://api.example.test/api/v1',
        VITE_HISTORY_COLLAPSE_CHAR_THRESHOLD: '0',
      },
      {
        VITE_API_BASE_URL: 'https://api.example.test/api/v1',
        VITE_HISTORY_COLLAPSE_CHAR_THRESHOLD: '4.5',
      },
    ];

    for (const environment of invalidEnvironments) {
      expect(() => parseFrontendEnv(environment)).toThrow();
    }
  });
});
