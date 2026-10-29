import { defineAccount } from './define-account';

export {
  defineAccount,
  type AccountModuleAsyncOptions,
  type AccountModuleExtras,
  type AccountModuleOptions,
  type AccountScopes,
  type AccountSessionModuleOptions,
  type DefinedAccount,
  type DefinedSessionAccount,
  type SessionDefinition,
  type SessionOf,
  type SessionVerifier,
} from './define-account';
export { CurrentSession, type SessionPaths } from './session/session-http';
export {
  SessionRejected,
  type ClaimsSchema,
  type ResolvedSession,
  type Session,
  type SessionModuleOptions,
} from './session/session-manager';
export {
  memorySessionStore,
  prismaSessionStore,
  redisSessionStore,
  type PrismaSessionDelegate,
  type PrismaSessionRow,
  type RedisSessionClient,
  type SessionRecord,
  type SessionStore,
} from './session/session-store';
export * from '@gsainfoteam/account-server';

/** 필드 타입이나 서비스 세션이 필요하면 {@link defineAccount}를 쓴다. */
export const { AccountModule, AccountService } = defineAccount();
export type AccountService = InstanceType<typeof AccountService>;
