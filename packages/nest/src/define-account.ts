import { AccountError, SESSION_PATHS } from '@gsainfoteam/account-core';
import {
  createAccountServer,
  type AccountServer,
  type AccountServerOptions,
  type ClientScope,
} from '@gsainfoteam/account-server';
import {
  ConfigurableModuleBuilder,
  Module,
  type CanActivate,
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

/** {@link defineAccount} 로 코드에 고정하는 scope. 값의 뜻은 {@link AccountServerOptions} 와 같다. */
export interface AccountScopes<
  RequiredScopes extends readonly ClientScope[],
  LookupScopes extends readonly ClientScope[],
> {
  requiredScopes?: RequiredScopes;
  clientCredentialsScopes?: LookupScopes;
}

/** {@link defineAccount} 의 `session`. 타입을 정하는 정적인 것만 둔다. 런타임 값은 `forRoot` 의 `session` 이다. */
export interface SessionDefinition<Claims extends Record<string, unknown>> {
  /** access token 에 실을 claim 의 zod 스키마. `resolve` 가 돌려줄 값과 `@CurrentSession()` 의 타입이 여기서 나온다. */
  claims?: ClaimsSchema<Claims>;
  /** 세션 endpoint 경로. 빠진 것은 `/auth/login`, `/auth/refresh`, `/auth/logout` 이다. */
  paths?: Partial<SessionPaths>;
}

/** `forRoot` 에 넘기는 런타임 옵션. 보통 환경 변수에서 온다. scope 는 {@link defineAccount} 에서 정한다. */
export type AccountModuleOptions = Omit<
  AccountServerOptions,
  'requiredScopes' | 'clientCredentialsScopes'
>;

/** 세션을 정의한 계정의 `forRoot` 옵션. */
export type AccountSessionModuleOptions<
  RequiredScope extends ClientScope,
  Claims extends Record<string, unknown>,
> = AccountModuleOptions & { session: SessionModuleOptions<RequiredScope, Claims> };

export interface AccountModuleExtras {
  /** 다른 모듈에서 import 하지 않고도 {@link AccountService} 와 guard 를 쓰게 한다. */
  isGlobal: boolean;
}

/** `forRootAsync` 에 넘기는 옵션. */
export type AccountModuleAsyncOptions<Options = AccountModuleOptions> =
  ConfigurableModuleAsyncOptions<Options> & Partial<AccountModuleExtras>;

/** 주입받은 {@link AccountServer} 에 더해지는 세션 검증. guard 를 쓸 수 없는 곳(WebSocket 같은)에서 쓴다. */
export interface SessionVerifier<Claims extends Record<string, unknown>> {
  /** @returns 서비스 access token 이 유효하지 않거나 세션이 끝났으면 `null`. */
  verifySession(accessToken: string): Promise<Session<Claims> | null>;
}

/** {@link defineAccount} 가 돌려주는 모듈과 서비스. */
export interface DefinedAccount<
  RequiredScope extends ClientScope,
  LookupScope extends ClientScope,
> {
  /** `forRoot` 와 `forRootAsync` 로 등록한다. */
  AccountModule: ConfigurableModuleCls<
    AccountModuleOptions,
    'forRoot',
    'create',
    AccountModuleExtras
  >;
  /** 주입 토큰이자 타입. 주입받으면 scope 가 타입에 반영된 {@link AccountServer} 가 온다. */
  AccountService: abstract new () => AccountServer<RequiredScope, LookupScope>;
}

/** 세션까지 정의한 {@link defineAccount} 가 돌려주는 것. */
export interface DefinedSessionAccount<
  RequiredScope extends ClientScope,
  LookupScope extends ClientScope,
  Claims extends Record<string, unknown>,
> {
  /** `forRoot` 와 `forRootAsync` 로 등록한다. `session` 옵션이 필요하고, 세션 endpoint 를 함께 등록한다. */
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
  /** 세션이 없어도 지나가고, 있으면 `@CurrentSession()` 으로 받을 수 있게 한다. */
  OptionalSessionGuard: Type<CanActivate>;
}

/** {@link DefinedSessionAccount} 의 세션 타입. `@CurrentSession()` 인자에 붙인다. */
export type SessionOf<
  Account extends { AccountService: abstract new () => SessionVerifier<Record<string, unknown>> },
> = NonNullable<Awaited<ReturnType<InstanceType<Account['AccountService']>['verifySession']>>>;

/**
 * 주입되는 {@link AccountServer} 를 설명하는 추상 클래스. 직접 만들지 않고, 주입 토큰과 타입으로만 쓴다.
 *
 * @remarks
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
}

/**
 * scope 를 고정한 Nest 모듈과 서비스를 만든다. `session` 을 주면 서비스 세션(로그인, refresh, 로그아웃 endpoint 와
 * guard)도 만든다.
 *
 * 서비스 클래스가 주입 토큰이라, 모듈에 선언한 scope 와 다른 타입으로 주입받을 길이 없다.
 * 호출할 때마다 토큰이 새로 생기므로 설정이 다른 계정 여러 개가 한 앱에 함께 있을 수 있다.
 *
 * @example
 * ```ts
 * // account.ts
 * export const account = defineAccount({
 *   requiredScopes: ['name', 'student_id'],
 *   session: { claims: z.object({ devicePk: z.number() }) },
 * });
 * export const { AccountModule, AccountService, SessionGuard } = account;
 * export type AccountService = InstanceType<typeof AccountService>;
 * export type Session = SessionOf<typeof account>;
 * ```
 *
 * @remarks
 * `export type AccountService` 줄은 빼면 안 된다. 구조 분해로 꺼낸 클래스 값은 TS 에서 타입 이름이 되지 않는다.
 * 같은 이름의 값과 타입이 함께 있어야 `emitDecoratorMetadata` 가 생성자 인자에 클래스 값을 기록해서,
 * `@Inject` 없이도 주입된다.
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

  const createRuntime = ({ session, ...options }: AnyModuleOptions): AccountRuntime => {
    const server = createAccountServer({ ...options, ...scopes });
    if (!sessionDefinition) return { service: server };

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
  class AccountModule extends ConfigurableModuleClass {}

  return sessionDefinition
    ? { AccountModule, AccountService, ...createSessionGuards(AccountService) }
    : { AccountModule, AccountService };
}
