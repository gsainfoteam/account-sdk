import { AccountError, SESSION_PATHS } from '@gsainfoteam/account-core';
import {
  createAccountServer,
  type AccountServer,
  type AccountServerOptions,
  type ClientScope,
} from '@gsainfoteam/account-server';
import {
  ConfigurableModuleBuilder,
  Inject,
  Logger,
  Module,
  type CanActivate,
  type OnApplicationBootstrap,
  type ConfigurableModuleAsyncOptions,
  type ConfigurableModuleCls,
  type Type,
} from '@nestjs/common';
import * as z from 'zod/mini';

import {
  cookieSettings,
  createSessionController,
  createSessionGuards,
  type SessionPaths,
  type SessionRuntime,
} from './session/session-http';
import {
  createSessionManager,
  type ClaimsSchema,
  type Session,
  type SessionModuleOptions,
} from './session/session-manager';

export interface AccountScopes<
  RequiredScopes extends readonly ClientScope[],
  LookupScopes extends readonly ClientScope[],
> {
  requiredScopes?: RequiredScopes;
  clientCredentialsScopes?: LookupScopes;
}

export interface SessionDefinition<Claims extends Record<string, unknown>> {
  claims?: ClaimsSchema<Claims>;
  /** 빠진 것은 `/auth/login`, `/auth/refresh`, `/auth/logout` 이다. */
  paths?: Partial<SessionPaths>;
}

export type AccountModuleOptions = Omit<
  AccountServerOptions,
  'requiredScopes' | 'clientCredentialsScopes'
> & {
  /**
   * 기본 `error` 는 등록이 맞지 않으면 앱이 뜨지 않고, `warn` 은 로그만 남긴다. IdP 에 닿지 못하면 어느 쪽이든 로그만 남긴다.
   */
  verifyRegistration?: 'error' | 'warn' | 'off';
};

export type AccountSessionModuleOptions<
  RequiredScope extends ClientScope,
  Claims extends Record<string, unknown>,
> = AccountModuleOptions & { session: SessionModuleOptions<RequiredScope, Claims> };

export interface AccountModuleExtras {
  isGlobal: boolean;
}

export type AccountModuleAsyncOptions<Options = AccountModuleOptions> =
  ConfigurableModuleAsyncOptions<Options> & Partial<AccountModuleExtras>;

export interface SessionVerifier<Claims extends Record<string, unknown>> {
  verifySession(accessToken: string): Promise<Session<Claims> | null>;
}

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

export interface DefinedSessionAccount<
  RequiredScope extends ClientScope,
  LookupScope extends ClientScope,
  Claims extends Record<string, unknown>,
> {
  AccountModule: ConfigurableModuleCls<
    AccountSessionModuleOptions<RequiredScope, Claims>,
    'forRoot',
    'create',
    AccountModuleExtras
  >;
  AccountService: abstract new () => AccountServer<RequiredScope, LookupScope> &
    SessionVerifier<Claims>;
  /** 서비스 access token 이 없거나 유효하지 않으면 401 을 던진다. */
  SessionGuard: Type<CanActivate>;
  OptionalSessionGuard: Type<CanActivate>;
}

export type SessionOf<
  Account extends { AccountService: abstract new () => SessionVerifier<Record<string, unknown>> },
> = NonNullable<Awaited<ReturnType<InstanceType<Account['AccountService']>['verifySession']>>>;

/**
 * 생성자 인자의 타입이 클래스여야 `emitDecoratorMetadata` 가 주입 토큰을 기록한다. 실제로 주입되는 값은
 * `createAccountServer` 가 만든 객체이고, `implements` 가 그 모양과 이 클래스를 묶어 둔다.
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

abstract class SessionAccountServerToken<
  RequiredScope extends ClientScope,
  LookupScope extends ClientScope,
  Claims extends Record<string, unknown>,
>
  extends AccountServerToken<RequiredScope, LookupScope>
  implements SessionVerifier<Claims>
{
  abstract verifySession: SessionVerifier<Claims>['verifySession'];
}

type AnyModuleOptions = AccountModuleOptions & {
  session?: SessionModuleOptions<ClientScope, Record<string, unknown>>;
};

interface AccountRuntime {
  service: AccountServer<ClientScope, ClientScope> &
    Partial<SessionVerifier<Record<string, unknown>>>;
  session?: SessionRuntime;
  verifyRegistration: NonNullable<AccountModuleOptions['verifyRegistration']>;
}

/**
 * 호출할 때마다 주입 토큰이 새로 생기므로 설정이 다른 계정 여러 개가 한 앱에 함께 있을 수 있다.
 *
 * 꺼낸 `AccountService` 옆에 `export type AccountService = InstanceType<typeof AccountService>` 를 빼면 안 된다.
 * 구조 분해로 꺼낸 클래스 값은 TS 에서 타입 이름이 되지 않는다. 같은 이름의 값과 타입이 함께 있어야
 * `emitDecoratorMetadata` 가 생성자 인자에 클래스 값을 기록해서, `@Inject` 없이도 주입된다.
 */
export function defineAccount<
  const RequiredScopes extends readonly ClientScope[] = [],
  const LookupScopes extends readonly ClientScope[] = [],
  Claims extends Record<string, unknown> = Record<never, never>,
>(
  definition: AccountScopes<RequiredScopes, LookupScopes> & { session: SessionDefinition<Claims> },
): DefinedSessionAccount<RequiredScopes[number], LookupScopes[number], Claims>;
export function defineAccount<
  const RequiredScopes extends readonly ClientScope[] = [],
  const LookupScopes extends readonly ClientScope[] = [],
>(
  definition?: AccountScopes<RequiredScopes, LookupScopes>,
): DefinedAccount<RequiredScopes[number], LookupScopes[number]>;
export function defineAccount(
  definition: AccountScopes<readonly ClientScope[], readonly ClientScope[]> & {
    session?: SessionDefinition<Record<string, unknown>>;
  } = {},
): object {
  const { session: sessionDefinition, ...scopes } = definition;

  const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
    new ConfigurableModuleBuilder<AnyModuleOptions>()
      .setClassMethodName('forRoot')
      .setExtras<AccountModuleExtras>({ isGlobal: false }, (module, extras) => ({
        ...module,
        global: extras.isGlobal,
      }))
      .build();

  const RUNTIME = Symbol('gsainfoteam-account:runtime');
  const SESSION_RUNTIME = Symbol('gsainfoteam-account:session-runtime');
  const paths: SessionPaths = { ...SESSION_PATHS, ...sessionDefinition?.paths };

  abstract class AccountService extends SessionAccountServerToken<
    ClientScope,
    ClientScope,
    Record<string, unknown>
  > {}

  const createRuntime = ({
    session,
    verifyRegistration = 'error',
    ...options
  }: AnyModuleOptions): AccountRuntime => {
    const server = createAccountServer({ ...options, ...scopes });
    if (!sessionDefinition) return { service: server, verifyRegistration };

    if (!session) {
      throw new AccountError('invalid_request', {
        description: 'this account defines a session, so forRoot needs the session option',
      });
    }

    const manager = createSessionManager(
      server,
      options.clientId,
      scopes.requiredScopes ?? [],
      sessionDefinition.claims ?? z.object({}),
      session,
    );

    return {
      service: { ...server, verifySession: manager.verify },
      session: { manager, cookie: cookieSettings(session.cookie, paths) },
      verifyRegistration,
    };
  };

  @Module({
    providers: [
      { provide: RUNTIME, inject: [MODULE_OPTIONS_TOKEN], useFactory: createRuntime },
      {
        provide: AccountService,
        inject: [RUNTIME],
        useFactory: (runtime: AccountRuntime) => runtime.service,
      },
      ...(sessionDefinition
        ? [
            {
              provide: SESSION_RUNTIME,
              inject: [RUNTIME],
              useFactory: (runtime: AccountRuntime) => runtime.session,
            },
          ]
        : []),
    ],
    controllers: sessionDefinition ? [createSessionController(SESSION_RUNTIME, paths)] : [],
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

  return sessionDefinition
    ? { AccountModule, AccountService, ...createSessionGuards(AccountService) }
    : { AccountModule, AccountService };
}
