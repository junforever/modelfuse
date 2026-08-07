import axios, { type AxiosAdapter, type AxiosInstance } from 'axios';

export interface CreateApiClientOptions {
  readonly baseURL: string;
  readonly adapter?: AxiosAdapter;
}

export function createApiClient({ baseURL, adapter }: CreateApiClientOptions): AxiosInstance {
  return axios.create({ baseURL, adapter });
}
