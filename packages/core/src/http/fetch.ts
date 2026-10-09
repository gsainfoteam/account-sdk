/** SDK 가 전역 `fetch` 대신 쓸 수 있는 구현. */
export type Fetch = typeof globalThis.fetch;

export interface RequestOptions {
  fetch?: Fetch;
  signal?: AbortSignal;
}
