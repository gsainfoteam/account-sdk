/** A `fetch` implementation the SDK can use instead of the global one. */
export type Fetch = typeof globalThis.fetch;

export interface RequestOptions {
  fetch?: Fetch;
  signal?: AbortSignal;
}
