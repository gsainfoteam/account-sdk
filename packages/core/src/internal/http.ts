export type Fetch = typeof globalThis.fetch;

export interface RequestOptions {
  fetch?: Fetch;
  signal?: AbortSignal;
}
