import {
  AUTHORIZATION_CODE_TTL_MS,
  ScopeSchema,
  type AuthorizationTransaction,
} from '@gsainfoteam/account-core';
import { attempt } from 'es-toolkit';
import * as z from 'zod/mini';

import { STORAGE_KEYS } from './keys';

const PREFIX = STORAGE_KEYS.transactionPrefix;

export const StoredTransactionSchema = z.object({
  state: z.string(),
  codeVerifier: z.string(),
  nonce: z.optional(z.string()),
  redirectUri: z.string(),
  scopes: z.array(ScopeSchema),
  createdAt: z.number(),
  returnTo: z.optional(z.string()),
});

export type StoredTransaction = z.infer<typeof StoredTransactionSchema>;

/**
 * 진행 중인 인가를 그 인가의 `state` 를 키로 저장한다. 여러 탭에서 동시에 로그인을 시작해도 서로의
 * verifier 를 덮어쓰지 않게 하기 위해서다.
 */
export function saveTransaction(
  storage: Storage,
  transaction: AuthorizationTransaction,
  returnTo?: string,
): void {
  pruneExpired(storage);

  const stored: StoredTransaction = { ...transaction, returnTo };
  storage.setItem(PREFIX + transaction.state, JSON.stringify(stored));
}

/** `state` 의 트랜잭션을 꺼내면서 지운다. 없거나, 모양이 틀렸거나, authorization code 수명보다 오래됐으면 `null` 이다. */
export function takeTransaction(storage: Storage, state: string | null): StoredTransaction | null {
  if (!state) return null;

  const raw = storage.getItem(PREFIX + state);
  storage.removeItem(PREFIX + state);
  if (!raw) return null;

  const parsed = StoredTransactionSchema.safeParse(safeJson(raw));
  if (!parsed.success || parsed.data.state !== state || isExpired(parsed.data)) return null;

  return parsed.data;
}

function pruneExpired(storage: Storage): void {
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (!key?.startsWith(PREFIX)) continue;

    const parsed = StoredTransactionSchema.safeParse(safeJson(storage.getItem(key)));
    if (!parsed.success || isExpired(parsed.data)) storage.removeItem(key);
  }
}

function isExpired(transaction: StoredTransaction): boolean {
  return Date.now() - transaction.createdAt > AUTHORIZATION_CODE_TTL_MS;
}

function safeJson(raw: string | null): unknown {
  if (raw === null) return undefined;

  const [, value] = attempt<unknown>(() => JSON.parse(raw));
  return value;
}
