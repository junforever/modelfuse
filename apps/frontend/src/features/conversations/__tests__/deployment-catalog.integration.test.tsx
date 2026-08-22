import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios, { type AxiosAdapter, type AxiosInstance } from 'axios';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConversationWorkspace } from '../components/ConversationWorkspace';
import { conversationKeys } from '../queries/conversation-keys';
import type {
  ConversationTurnResponse,
  DeploymentCatalogItem,
  DeploymentIds,
  ResponseSlot,
} from '../types/conversation';
import { createTestQueryClient } from '../../../test/query-test-utils';

const injectedClient = vi.hoisted(() => ({ current: null as AxiosInstance | null }));

vi.mock('../api/client', () => ({
  createApiClient: () => {
    if (!injectedClient.current) throw new Error('T030 controlled Axios client is unavailable');
    return injectedClient.current;
  },
}));

const CONVERSATION_ID = '70000000-0000-4000-8000-000000000030';
const TURN_ID = '71000000-0000-4000-8000-000000000030';
const EVENT_TIME = '2026-08-20T12:00:00.000Z';
const PROMPT = 'Compare this explicit deployment selection.';
const DEPLOYMENT_IDS: DeploymentIds = {
  'base-1': 'openai-5.6-terra',
  'base-2': 'gemini-3.7-flash',
  'base-3': 'openrouter-minimax-m3',
  consolidator: 'openrouter-qwen-3.8-max',
};
const DEFAULT_DEPLOYMENT_IDS: DeploymentIds = {
  'base-1': 'openai-5.6-sol',
  'base-2': 'gemini-3.7-flash',
  'base-3': 'openrouter-minimax-m3',
  consolidator: 'openrouter-qwen-3.8-max',
};
const CATALOG_ITEMS = [
  deployment('openai-5.6-terra', 'GPT-5.6 Terra', 'openai', 'gpt-5.6-terra', 1_050_000, 128_000, [
    'text',
    'image',
  ]),
  deployment(
    'gemini-3.7-flash',
    'Gemini 3.7 Flash',
    'google',
    'gemini-3.7-flash',
    1_048_576,
    65_536,
    ['text', 'image', 'video', 'audio', 'pdf']
  ),
  deployment(
    'openrouter-minimax-m3',
    'MiniMax M3',
    'openrouter',
    'minimax/minimax-m3',
    524_288,
    512_000,
    ['text', 'image', 'video']
  ),
  deployment(
    'openrouter-qwen-3.8-max',
    'Qwen 3.8 Max',
    'openrouter',
    'qwen/qwen3.8-max',
    1_000_000,
    131_072,
    ['text', 'image', 'video']
  ),
] as const;
const DEFAULT_CATALOG_ITEMS = [
  deployment('openai-5.6-sol', 'GPT-5.6 Sol', 'openai', 'gpt-5.6-sol', 1_050_000, 128_000, [
    'text',
    'image',
  ]),
  CATALOG_ITEMS[1],
  CATALOG_ITEMS[2],
  CATALOG_ITEMS[3],
] as const;

describe('deployment catalog query/cache and explicit creation UI boundary', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://t030.invalid/api/v1');
  });

  afterEach(() => {
    injectedClient.current = null;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('keeps the real query loading state visible until an empty HTTP response arrives', async () => {
    const gate = deferred<void>();
    const adapter: AxiosAdapter = async config => {
      if ((config.method ?? 'get').toLowerCase() !== 'get' || config.url !== '/model-catalog') {
        throw new Error(`Unexpected T039 transport request: ${config.method} ${config.url}`);
      }
      await gate.promise;
      return response(config, { items: [] });
    };
    const { queryClient, unmount } = renderWorkspace(adapter);

    try {
      expect(screen.getByRole('status')).toHaveTextContent('Cargando deployments');
      expect(screen.getByRole('group', { name: 'Deployments' })).toBeDisabled();

      gate.resolve();

      expect(await screen.findByText('No hay deployments disponibles.')).toBeVisible();
      expect(screen.getByRole('group', { name: 'Deployments' })).toBeDisabled();
      expect(queryClient.getQueryData(conversationKeys.catalog)).toEqual({ items: [] });
    } finally {
      gate.resolve();
      unmount();
      queryClient.clear();
    }
  });

  it('renders the safe catalog error state without a manual retry control', async () => {
    let requestCount = 0;
    const adapter: AxiosAdapter = async config => {
      requestCount += 1;
      throw new Error(`Controlled T039 catalog failure: ${config.url}`);
    };
    const { queryClient, unmount } = renderWorkspace(adapter);

    try {
      expect(
        await screen.findByText('No se pudo cargar el catálogo de deployments.')
      ).toBeVisible();
      expect(requestCount).toBe(1);
      expect(screen.getByRole('group', { name: 'Deployments' })).toBeDisabled();
      expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
    } finally {
      unmount();
      queryClient.clear();
    }
  });

  it('recovers only through React Query retry with the real hook and controlled HTTP', async () => {
    let requestCount = 0;
    const adapter: AxiosAdapter = async config => {
      requestCount += 1;
      if (requestCount === 1) throw new Error('Controlled first catalog failure');
      return response(config, { items: DEFAULT_CATALOG_ITEMS });
    };
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: 1, retryDelay: 0 },
        mutations: { retry: false },
      },
    });
    const rendered = renderWorkspace(adapter, queryClient);

    try {
      await waitFor(() => expect(requestCount).toBe(2));
      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: 'Base 1' })).toHaveTextContent(
          'openai-5.6-sol'
        );
        expect(screen.getByRole('combobox', { name: 'Base 2' })).toHaveTextContent(
          'gemini-3.7-flash'
        );
        expect(screen.getByRole('combobox', { name: 'Base 3' })).toHaveTextContent(
          'openrouter-minimax-m3'
        );
        expect(screen.getByRole('combobox', { name: 'Consolidador' })).toHaveTextContent(
          'openrouter-qwen-3.8-max'
        );
      });
      expect(queryClient.getQueryData(conversationKeys.catalog)).toEqual({
        items: DEFAULT_CATALOG_ITEMS,
      });
      expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
    } finally {
      rendered.unmount();
      queryClient.clear();
    }
  });

  it('announces a selected deployment removed by a later catalog refresh', async () => {
    let items: readonly DeploymentCatalogItem[] = CATALOG_ITEMS;
    const adapter: AxiosAdapter = async config => response(config, { items });
    const { queryClient, user, unmount } = renderWorkspace(adapter);

    try {
      const base1 = await screen.findByRole('combobox', { name: 'Base 1' });
      await user.click(base1);
      await user.click(
        within(await screen.findByRole('listbox')).getByRole('option', {
          name: 'GPT-5.6 Terra · openai',
        })
      );
      expect(base1).toHaveTextContent('openai-5.6-terra');

      items = CATALOG_ITEMS.filter(item => item.deploymentId !== 'openai-5.6-terra');
      await queryClient.invalidateQueries({ queryKey: conversationKeys.catalog });

      expect(
        await screen.findByText(
          'Una selección ya no está disponible. Elige otro deployment para continuar.'
        )
      ).toBeVisible();
      expect(queryClient.getQueryData(conversationKeys.catalog)).toEqual({ items });
      expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    } finally {
      unmount();
      queryClient.clear();
    }
  });

  it('preselects and sends the exact default profile when the validated catalog is complete', async () => {
    const captured: Array<{ method: string; path: string; data: unknown }> = [];
    const adapter: AxiosAdapter = async config => {
      const method = (config.method ?? 'get').toLowerCase();
      const path = config.url ?? '';
      const data = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      captured.push({ method, path, data });

      if (method === 'get' && path === '/model-catalog') {
        return response(config, { items: DEFAULT_CATALOG_ITEMS });
      }
      if (method === 'post' && path === '/conversations') {
        return response(
          config,
          creationResponse(
            data as { clientRequestId: string; prompt: string },
            DEFAULT_CATALOG_ITEMS
          )
        );
      }
      throw new Error(`Unexpected T035 transport request: ${method.toUpperCase()} ${path}`);
    };
    injectedClient.current = axios.create({
      baseURL: 'https://t030.invalid/api/v1',
      adapter,
    });

    const queryClient = createTestQueryClient();
    const user = userEvent.setup();
    const Wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { unmount } = render(<ConversationWorkspace />, { wrapper: Wrapper });

    try {
      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: 'Base 1' })).toHaveTextContent(
          'openai-5.6-sol'
        );
        expect(screen.getByRole('combobox', { name: 'Base 2' })).toHaveTextContent(
          'gemini-3.7-flash'
        );
        expect(screen.getByRole('combobox', { name: 'Base 3' })).toHaveTextContent(
          'openrouter-minimax-m3'
        );
        expect(screen.getByRole('combobox', { name: 'Consolidador' })).toHaveTextContent(
          'openrouter-qwen-3.8-max'
        );
      });
      expect(queryClient.getQueryData(conversationKeys.catalog)).toEqual({
        items: DEFAULT_CATALOG_ITEMS,
      });

      await user.type(screen.getByRole('textbox', { name: 'Prompt' }), PROMPT);
      await user.click(screen.getByRole('button', { name: 'Enviar' }));

      await waitFor(() => expect(captured).toHaveLength(2));
      const createRequest = captured[1]!;
      expect(createRequest).toMatchObject({
        method: 'post',
        path: '/conversations',
        data: {
          clientRequestId: expect.any(String),
          prompt: PROMPT,
          deploymentIds: DEFAULT_DEPLOYMENT_IDS,
        },
      });
      expect(captured[0]).toEqual({ method: 'get', path: '/model-catalog', data: undefined });

      const expected = creationResponse(
        createRequest.data as { clientRequestId: string; prompt: string },
        DEFAULT_CATALOG_ITEMS
      );
      await waitFor(() => {
        expect(queryClient.getQueryData(conversationKeys.detail(CONVERSATION_ID))).toEqual(
          expected.conversation
        );
        expect(
          queryClient.getQueryData(conversationKeys.turn(CONVERSATION_ID, TURN_ID))
        ).toMatchObject({
          conversationId: CONVERSATION_ID,
          turnId: TURN_ID,
          turn: expected.turn,
        });
      });
    } finally {
      unmount();
      queryClient.clear();
    }
  });

  it('applies no partial defaults and requires four explicit selections for an incomplete catalog', async () => {
    const captured: Array<{ method: string; path: string; data: unknown }> = [];
    const adapter: AxiosAdapter = async config => {
      const method = (config.method ?? 'get').toLowerCase();
      const path = config.url ?? '';
      const data = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      captured.push({ method, path, data });

      if (method === 'get' && path === '/model-catalog') {
        return response(config, { items: CATALOG_ITEMS });
      }
      if (method === 'post' && path === '/conversations') {
        return response(
          config,
          creationResponse(data as { clientRequestId: string; prompt: string })
        );
      }
      throw new Error(`Unexpected T030 transport request: ${method.toUpperCase()} ${path}`);
    };
    injectedClient.current = axios.create({
      baseURL: 'https://t030.invalid/api/v1',
      adapter,
    });

    const queryClient = createTestQueryClient();
    const user = userEvent.setup();
    const Wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { unmount } = render(<ConversationWorkspace />, { wrapper: Wrapper });

    try {
      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: 'Base 1' })).toBeEnabled();
      });
      expect(queryClient.getQueryData(conversationKeys.catalog)).toEqual({ items: CATALOG_ITEMS });
      for (const selector of screen.getAllByRole('combobox')) {
        expect(selector).toHaveTextContent('Selecciona un deployment');
      }

      await user.type(screen.getByRole('textbox', { name: 'Prompt' }), PROMPT);
      expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
      expect(captured).toEqual([{ method: 'get', path: '/model-catalog', data: undefined }]);

      const choices = [
        ['Base 1', 'GPT-5.6 Terra · openai'],
        ['Base 2', 'Gemini 3.7 Flash · google'],
        ['Base 3', 'MiniMax M3 · openrouter'],
        ['Consolidador', 'Qwen 3.8 Max · openrouter'],
      ] as const;
      for (const [label, option] of choices) {
        await user.click(screen.getByRole('combobox', { name: label }));
        const listbox = await screen.findByRole('listbox');
        expect(within(listbox).getAllByRole('option')).toHaveLength(4);
        await user.click(within(listbox).getByRole('option', { name: option }));
      }

      await user.click(screen.getByRole('button', { name: 'Enviar' }));

      await waitFor(() => expect(captured).toHaveLength(2));
      const createRequest = captured[1]!;
      expect(createRequest).toMatchObject({
        method: 'post',
        path: '/conversations',
        data: {
          clientRequestId: expect.any(String),
          prompt: PROMPT,
          deploymentIds: DEPLOYMENT_IDS,
        },
      });
      expect(captured[0]).toEqual({ method: 'get', path: '/model-catalog', data: undefined });

      const expected = creationResponse(
        createRequest.data as { clientRequestId: string; prompt: string }
      );
      await waitFor(() => {
        expect(queryClient.getQueryData(conversationKeys.detail(CONVERSATION_ID))).toEqual(
          expected.conversation
        );
        expect(
          queryClient.getQueryData(conversationKeys.turn(CONVERSATION_ID, TURN_ID))
        ).toMatchObject({
          conversationId: CONVERSATION_ID,
          turnId: TURN_ID,
          turn: expected.turn,
        });
      });
    } finally {
      unmount();
      queryClient.clear();
    }
  });
});

function response(config: Parameters<AxiosAdapter>[0], data: unknown) {
  return Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config });
}

function renderWorkspace(adapter: AxiosAdapter, queryClient = createTestQueryClient()) {
  injectedClient.current = axios.create({
    baseURL: 'https://t039.invalid/api/v1',
    adapter,
  });
  const user = userEvent.setup();
  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { user, queryClient, ...render(<ConversationWorkspace />, { wrapper: Wrapper }) };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

function creationResponse(
  payload: {
    clientRequestId: string;
    prompt: string;
  },
  catalogItems: readonly DeploymentCatalogItem[] = CATALOG_ITEMS
): ConversationTurnResponse {
  const summaries = catalogItems.map((item, index) => ({
    slot: (['base-1', 'base-2', 'base-3', 'consolidator'] as const)[index]!,
    deploymentId: item.deploymentId,
    providerId: item.providerId,
    modelId: item.modelId,
    displayName: item.displayName,
  }));
  const responses = summaries.map(summary => ({
    slot: summary.slot,
    role: summary.slot === 'consolidator' ? ('consolidator' as const) : ('base' as const),
    provider: summary.providerId,
    model: summary.modelId,
    status: 'completed' as const,
    content: `${summary.slot} deterministic response`,
    error: null,
    recoverable: false,
    continuedWithout: false,
    isStale: false,
    attemptNo: 1,
    metadata: null,
    startedAt: EVENT_TIME,
    completedAt: EVENT_TIME,
    createdAt: EVENT_TIME,
    updatedAt: EVENT_TIME,
  }));

  return {
    conversation: {
      id: CONVERSATION_ID,
      title: PROMPT,
      hasWorkInProgress: false,
      createdAt: EVENT_TIME,
      updatedAt: EVENT_TIME,
      deployments: summaries as ConversationTurnResponse['conversation']['deployments'],
    },
    turn: {
      id: TURN_ID,
      clientRequestId: payload.clientRequestId,
      ordinal: 1,
      prompt: payload.prompt,
      status: 'completed',
      responses: responses as ConversationTurnResponse['turn']['responses'],
      createdAt: EVENT_TIME,
      updatedAt: EVENT_TIME,
    },
  };
}

function deployment(
  deploymentId: string,
  displayName: string,
  providerId: DeploymentCatalogItem['providerId'],
  modelId: string,
  contextLimitTokens: number,
  maxOutputTokens: number,
  inputModalities: DeploymentCatalogItem['inputModalities']
): DeploymentCatalogItem {
  return {
    deploymentId,
    displayName,
    providerId,
    modelId,
    contextLimitTokens,
    maxOutputTokens,
    inputModalities,
    outputModalities: ['text'],
  };
}
