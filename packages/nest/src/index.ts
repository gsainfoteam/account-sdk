import { defineAccount } from './define-account';

export {
  defineAccount,
  type AccountModuleAsyncOptions,
  type AccountModuleExtras,
  type AccountModuleOptions,
  type AccountScopes,
  type DefinedAccount,
} from './define-account';
export * from '@gsainfoteam/account-server';

/** scope 를 선언하지 않은 기본 모듈과 서비스. 필드 타입이 필요하면 {@link defineAccount} 를 쓴다. */
export const { AccountModule, AccountService } = defineAccount();
export type AccountService = InstanceType<typeof AccountService>;
