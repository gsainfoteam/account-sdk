import { AccountError } from '@infoteam/account-core';
import {
  createAccountServer,
  type AccountServer,
  type AccountServerOptions,
  type ClientScope,
} from '@infoteam/account-server';
import {
  ConfigurableModuleBuilder,
  Inject,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type ConfigurableModuleAsyncOptions,
  type ConfigurableModuleCls,
} from '@nestjs/common';

export interface AccountScopes<
  RequiredScopes extends readonly ClientScope[],
  LookupScopes extends readonly ClientScope[],
> {
  requiredScopes?: RequiredScopes;
  clientCredentialsScopes?: LookupScopes;
}

export type AccountModuleOptions = Omit<
  AccountServerOptions,
  'requiredScopes' | 'clientCredentialsScopes'
> & {
  /**
   * 기본값인 `error`는 등록이 맞지 않으면 앱이 시작되지 않게 하고, `warn`은 로그만 남긴다. IdP에 연결하지 못하면
   * 어느 쪽이든 로그만 남긴다.
   */
  verifyRegistration?: 'error' | 'warn' | 'off';
};

export interface AccountModuleExtras {
  isGlobal: boolean;
}

export type AccountModuleAsyncOptions<Options = AccountModuleOptions> =
  ConfigurableModuleAsyncOptions<Options> & Partial<AccountModuleExtras>;

export interface DefinedAccount<
  RequiredScope extends ClientScope,
  LookupScope extends ClientScope,
> {
  AccountModule: ConfigurableModuleCls<
    AccountModuleOptions,
    'forRoot',
    'create',
    AccountModuleExtras
  >;
  AccountService: abstract new () => AccountServer<RequiredScope, LookupScope>;
}

/**
 * 생성자 인자의 타입이 클래스여야 `emitDecoratorMetadata`가 주입 토큰을 기록한다. 실제로 주입되는 값은
 * `createAccountServer`가 만든 객체이고, `implements`가 그 모양과 이 클래스를 묶어 둔다.
 */
abstract class AccountServerToken<
  RequiredScope extends ClientScope,
  LookupScope extends ClientScope,
> implements AccountServer<RequiredScope, LookupScope> {
  abstract metadata: AccountServer<RequiredScope, LookupScope>['metadata'];
  abstract loginWithCode: AccountServer<RequiredScope, LookupScope>['loginWithCode'];
  abstract getUserInfoBySub: AccountServer<RequiredScope, LookupScope>['getUserInfoBySub'];
  abstract verifyIdToken: AccountServer<RequiredScope, LookupScope>['verifyIdToken'];
  abstract revoke: AccountServer<RequiredScope, LookupScope>['revoke'];
  abstract verifyRegistration: AccountServer<RequiredScope, LookupScope>['verifyRegistration'];
}

interface AccountRuntime {
  service: AccountServer<ClientScope, ClientScope>;
  verifyRegistration: NonNullable<AccountModuleOptions['verifyRegistration']>;
}

/**
 * 호출할 때마다 주입 토큰이 새로 생기므로 설정이 다른 계정 여러 개가 한 앱에 함께 있을 수 있다.
 *
 * 꺼낸 `AccountService` 옆에 `export type AccountService = InstanceType<typeof AccountService>`를 빼면 안 된다.
 * 구조 분해로 꺼낸 클래스 값은 TS에서 타입 이름이 되지 않는다. 같은 이름의 값과 타입이 함께 있어야
 * `emitDecoratorMetadata`가 생성자 인자에 클래스 값을 기록해서, `@Inject` 없이도 주입된다.
 */
export function defineAccount<
  const RequiredScopes extends readonly ClientScope[] = [],
  const LookupScopes extends readonly ClientScope[] = [],
>(
  scopes?: AccountScopes<RequiredScopes, LookupScopes>,
): DefinedAccount<RequiredScopes[number], LookupScopes[number]>;
export function defineAccount(
  scopes: AccountScopes<readonly ClientScope[], readonly ClientScope[]> = {},
): object {
  const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
    new ConfigurableModuleBuilder<AccountModuleOptions>()
      .setClassMethodName('forRoot')
      .setExtras<AccountModuleExtras>({ isGlobal: false }, (module, extras) => ({
        ...module,
        global: extras.isGlobal,
      }))
      .build();

  const RUNTIME = Symbol('gsainfoteam-account:runtime');

  abstract class AccountService extends AccountServerToken<ClientScope, ClientScope> {}

  const createRuntime = ({
    verifyRegistration = 'error',
    ...options
  }: AccountModuleOptions): AccountRuntime => ({
    service: createAccountServer({ ...options, ...scopes }),
    verifyRegistration,
  });

  @Module({
    providers: [
      { provide: RUNTIME, inject: [MODULE_OPTIONS_TOKEN], useFactory: createRuntime },
      {
        provide: AccountService,
        inject: [RUNTIME],
        useFactory: (runtime: AccountRuntime) => runtime.service,
      },
    ],
    exports: [AccountService],
  })
  class AccountModule extends ConfigurableModuleClass implements OnApplicationBootstrap {
    constructor(@Inject(RUNTIME) private readonly runtime: AccountRuntime) {
      super();
    }

    async onApplicationBootstrap(): Promise<void> {
      const { service, verifyRegistration } = this.runtime;
      if (verifyRegistration === 'off') return;

      try {
        await service.verifyRegistration();
      } catch (error) {
        const mismatch = AccountError.is(error, 'invalid_client');
        if (mismatch && verifyRegistration === 'error') throw error;

        new Logger('AccountModule').warn(
          mismatch
            ? `IdP registration does not match: ${error.description}`
            : `could not check the IdP registration: ${String(error)}`,
        );
      }
    }
  }

  return { AccountModule, AccountService };
}
