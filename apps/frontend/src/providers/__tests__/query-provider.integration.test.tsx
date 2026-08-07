import { useQueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { QueryProvider } from '../query-provider';

function QueryClientProbe() {
  const queryClient = useQueryClient();
  return <output>{queryClient.getDefaultOptions().queries?.staleTime?.toString() ?? 'ready'}</output>;
}

describe('QueryProvider', () => {
  it('provides one real QueryClient to its children', () => {
    render(
      <QueryProvider>
        <QueryClientProbe />
      </QueryProvider>
    );

    expect(screen.getByText('ready')).toBeVisible();
  });
});
