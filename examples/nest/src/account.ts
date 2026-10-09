import { defineAccount } from '@gsainfoteam/account-nest';

export const { AccountModule, AccountService } = defineAccount({ requiredScopes: ['name'] });
export type AccountService = InstanceType<typeof AccountService>;
