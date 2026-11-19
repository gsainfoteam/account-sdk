export { createAccountClient } from './client/create-account-client';
export { AccountClientOptionsSchema, type AccountClientOptions } from './client/options';
export {
  type AccountClient,
  type AccountState,
  type AccountStatus,
  type LoginOptions,
  type LogoutOptions,
  type RequireAuthOptions,
} from './client/types';
export {
  type LoginCredential,
  type Session,
  type SessionPaths,
  type SessionRejection,
  type SessionTokens,
} from './session/session-adapter';
export {
  AccountError,
  type AccountErrorCode,
  type AccountErrorKind,
  type ClientScope,
  type Environment,
  type IssuerInput,
  type Prompt,
} from '@infoteam/account-core';
