import { defineAccount, type SessionOf } from '@gsainfoteam/account-nest';

export const account = defineAccount({ requiredScopes: ['name'], session: {} });
export const { AccountModule, AccountService, SessionGuard } = account;
export type AccountService = InstanceType<typeof AccountService>;
export type Session = SessionOf<typeof account>;
