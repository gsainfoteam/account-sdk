import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  type PgDatabase,
  type PgQueryResultHKT,
} from 'drizzle-orm/pg-core';

import type { SessionRecord, SessionStore } from './session-store';

/** 서비스의 Drizzle 스키마에 이 테이블을 다시 export해야 drizzle-kit이 마이그레이션을 만든다. */
export const accountSession = pgTable(
  'account_session',
  {
    tokenHash: text('token_hash').primaryKey(),
    sessionId: text('session_id').notNull(),
    subject: text('subject').notNull(),
    claims: jsonb('claims').$type<SessionRecord['claims']>().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => [
    index('account_session_session_id_idx').on(table.sessionId),
    index('account_session_subject_idx').on(table.subject),
    index('account_session_expires_at_idx').on(table.expiresAt),
  ],
);

export interface DrizzleSessionStoreOptions {
  /** 켜면 guard가 요청마다 DB를 한 번 읽어서, 로그아웃한 세션의 access token을 만료 전에도 막는다. */
  checkActive?: boolean;
}

export function drizzleSessionStore<Schema extends Record<string, unknown>>(
  db: PgDatabase<PgQueryResultHKT, Schema>,
  { checkActive = false }: DrizzleSessionStoreOptions = {},
): SessionStore {
  const store: SessionStore = {
    async save(record) {
      await db.insert(accountSession).values(record);
    },

    async find(tokenHash) {
      const [row] = await db
        .select()
        .from(accountSession)
        .where(eq(accountSession.tokenHash, tokenHash));
      return row ?? null;
    },

    async markUsed(tokenHash, at) {
      // 조건부 UPDATE 한 문장이라 동시에 온 refresh 중 하나만 행을 돌려받는다.
      const marked = await db
        .update(accountSession)
        .set({ usedAt: at })
        .where(and(eq(accountSession.tokenHash, tokenHash), isNull(accountSession.usedAt)))
        .returning({ tokenHash: accountSession.tokenHash });
      return marked.length > 0;
    },

    async deleteUsed(sessionId, before) {
      await db
        .delete(accountSession)
        .where(and(eq(accountSession.sessionId, sessionId), lt(accountSession.usedAt, before)));
    },

    async deleteSession(sessionId) {
      await db.delete(accountSession).where(eq(accountSession.sessionId, sessionId));
    },

    async deleteSubject(subject) {
      await db.delete(accountSession).where(eq(accountSession.subject, subject));
    },
  };

  if (checkActive) {
    store.isActive = async (sessionId) => {
      const [row] = await db
        .select({ tokenHash: accountSession.tokenHash })
        .from(accountSession)
        .where(
          and(eq(accountSession.sessionId, sessionId), gt(accountSession.expiresAt, new Date())),
        )
        .limit(1);
      return !!row;
    };
  }

  return store;
}
