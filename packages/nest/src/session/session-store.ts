import * as z from 'zod/mini';

/** JSON 으로 저장할 수 있는 객체. 세션 claim 은 이 모양이어야 한다. */
export const JsonObjectSchema = z.record(z.string(), z.json());
export type JsonObject = z.output<typeof JsonObjectSchema>;

/** 서비스가 발급한 refresh token 하나. 토큰 자체가 아니라 SHA-256 해시를 둔다. */
export interface SessionRecord {
  tokenHash: string;
  /** 로그인 한 번. refresh 로 토큰이 바뀌어도 같다. 쓰인 토큰이 다시 오면 이 세션의 토큰을 모두 지운다. */
  sessionId: string;
  subject: string;
  /** 로그인할 때 `resolve` 가 돌려준 claim. */
  claims: JsonObject;
  expiresAt: Date;
  /** refresh 에 쓰인 시각. 아직 안 쓰였으면 `null`. */
  usedAt: Date | null;
}

/**
 * refresh token 을 보관하는 곳. {@link prismaSessionStore} 를 쓰거나, 다른 저장소라면 직접 구현한다.
 *
 * @remarks
 * `markUsed` 는 원자적이어야 한다. 동시에 온 두 refresh 중 하나만 `true` 를 받아야 재사용을 감지할 수 있다.
 */
export interface SessionStore {
  save(record: SessionRecord): Promise<void>;
  find(tokenHash: string): Promise<SessionRecord | null>;
  /** `usedAt` 이 없을 때만 `at` 으로 표시하고, 표시했으면 `true` 를 돌려준다. */
  markUsed(tokenHash: string, at: Date): Promise<boolean>;
  /** 세션에서 `before` 전에 쓰인 토큰을 지운다. 교체할 때마다 불러서 세션마다 행이 쌓이지 않게 한다. */
  deleteUsed(sessionId: string, before: Date): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  deleteSubject(subject: string): Promise<void>;
  /**
   * 있으면 guard 가 요청마다 불러서, 끝난 세션의 access token 을 만료 전에도 막는다.
   * 요청마다 저장소를 읽게 되므로 즉시 폐기가 필요할 때만 둔다.
   */
  isActive?(sessionId: string): Promise<boolean>;
}

/** 테스트와 단일 프로세스 개발 서버용. 프로세스가 끝나면 세션도 사라진다. */
export function memorySessionStore(): SessionStore {
  const records = new Map<string, SessionRecord>();

  const deleteWhere = (match: (record: SessionRecord) => boolean): void => {
    for (const [hash, record] of records) if (match(record)) records.delete(hash);
  };

  return {
    async save(record) {
      records.set(record.tokenHash, { ...record });
    },

    async find(tokenHash) {
      return records.get(tokenHash) ?? null;
    },

    async markUsed(tokenHash, at) {
      const record = records.get(tokenHash);
      if (!record || record.usedAt) return false;

      record.usedAt = at;
      return true;
    },

    async deleteUsed(sessionId, before) {
      deleteWhere(
        (record) => record.sessionId === sessionId && !!record.usedAt && record.usedAt < before,
      );
    },

    async deleteSession(sessionId) {
      deleteWhere((record) => record.sessionId === sessionId);
    },

    async deleteSubject(subject) {
      deleteWhere((record) => record.subject === subject);
    },

    async isActive(sessionId) {
      const now = new Date();
      return [...records.values()].some(
        (record) => record.sessionId === sessionId && record.expiresAt > now,
      );
    },
  };
}

/** {@link prismaSessionStore} 가 쓰는 Prisma model delegate 의 부분. README 의 모델을 만들면 `prisma.accountSession` 이 맞는다. */
export interface PrismaSessionDelegate {
  create(args: { data: SessionRecord }): Promise<unknown>;
  findUnique(args: { where: { tokenHash: string } }): Promise<PrismaSessionRow | null>;
  updateMany(args: {
    where: { tokenHash: string; usedAt: null };
    data: { usedAt: Date };
  }): Promise<{ count: number }>;
  deleteMany(args: {
    where: { sessionId: string; usedAt?: { lt: Date } } | { subject: string };
  }): Promise<unknown>;
}

/** Prisma 가 읽어 주는 행. `claims` 는 Json 컬럼이라 모양을 확인하고 쓴다. */
export type PrismaSessionRow = Omit<SessionRecord, 'claims'> & { claims: unknown };

/**
 * Prisma model 에 refresh token 을 둔다. 모델 정의는 README 에 있다.
 *
 * @example
 * ```ts
 * session: { store: prismaSessionStore(prisma.accountSession), ... }
 * ```
 */
export function prismaSessionStore(delegate: PrismaSessionDelegate): SessionStore {
  return {
    async save(record) {
      await delegate.create({ data: record });
    },

    async find(tokenHash) {
      const row = await delegate.findUnique({ where: { tokenHash } });
      if (!row) return null;

      const claims = JsonObjectSchema.safeParse(row.claims);
      return { ...row, claims: claims.success ? claims.data : {} };
    },

    async markUsed(tokenHash, at) {
      const { count } = await delegate.updateMany({
        where: { tokenHash, usedAt: null },
        data: { usedAt: at },
      });
      return count > 0;
    },

    async deleteUsed(sessionId, before) {
      await delegate.deleteMany({ where: { sessionId, usedAt: { lt: before } } });
    },

    async deleteSession(sessionId) {
      await delegate.deleteMany({ where: { sessionId } });
    },

    async deleteSubject(subject) {
      await delegate.deleteMany({ where: { subject } });
    },
  };
}
