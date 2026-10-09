import {
  createAccountServer,
  type AccountServer,
  type AccountServerOptions,
  type ClientScope,
} from '@gsainfoteam/account-server';
import {
  ConfigurableModuleBuilder,
  Module,
  type ConfigurableModuleAsyncOptions,
  type ConfigurableModuleCls,
} from '@nestjs/common';

/** {@link defineAccount} 로 코드에 고정하는 scope. 값의 뜻은 {@link AccountServerOptions} 와 같다. */
export interface AccountScopes<
  RequiredScopes extends readonly ClientScope[],
  LookupScopes extends readonly ClientScope[],
> {
  requiredScopes?: RequiredScopes;
  clientCredentialsScopes?: LookupScopes;
}

/** `forRoot` 에 넘기는 런타임 옵션. 보통 환경 변수에서 온다. scope 는 {@link defineAccount} 에서 정한다. */
export type AccountModuleOptions = Omit<
  AccountServerOptions,
  'requiredScopes' | 'clientCredentialsScopes'
>;

export interface AccountModuleExtras {
  /** 다른 모듈에서 import 하지 않고도 {@link AccountService} 를 주입받게 한다. */
  isGlobal: boolean;
}

/** `forRootAsync` 에 넘기는 옵션. */
export type AccountModuleAsyncOptions = ConfigurableModuleAsyncOptions<AccountModuleOptions> &
  Partial<AccountModuleExtras>;

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
  abstract getUserInfo: AccountServer<RequiredScope, LookupScope>['getUserInfo'];
  abstract exchangeCode: AccountServer<RequiredScope, LookupScope>['exchangeCode'];
  abstract loginWithCode: AccountServer<RequiredScope, LookupScope>['loginWithCode'];
  abstract getUserInfoBySub: AccountServer<RequiredScope, LookupScope>['getUserInfoBySub'];
  abstract verifyIdToken: AccountServer<RequiredScope, LookupScope>['verifyIdToken'];
  abstract revoke: AccountServer<RequiredScope, LookupScope>['revoke'];
}

/**
 * scope 를 고정한 Nest 모듈과 서비스를 만든다.
 *
 * 서비스 클래스가 주입 토큰이라, 모듈에 선언한 scope 와 다른 타입으로 주입받을 길이 없다.
 * 호출할 때마다 토큰이 새로 생기므로 scope 가 다른 설정 여러 개가 한 앱에 함께 있을 수 있다.
 *
 * @example
 * ```ts
 * // account.ts
 * export const { AccountModule, AccountService } = defineAccount({
 *   requiredScopes: ['name', 'student_id'],
 * });
 * export type AccountService = InstanceType<typeof AccountService>;
 *
 * // 주입받는 쪽: user.studentId 가 string 이다
 * constructor(private readonly account: AccountService) {}
 * ```
 *
 * @remarks
 * `export type` 줄은 빼면 안 된다. 구조 분해로 꺼낸 클래스 값은 TS 에서 타입 이름이 되지 않는다.
 * 같은 이름의 값과 타입이 함께 있어야 `emitDecoratorMetadata` 가 생성자 인자에 클래스 값을 기록해서,
 * `@Inject` 없이도 주입된다.
 */
export function defineAccount<
  const RequiredScopes extends readonly ClientScope[] = [],
  const LookupScopes extends readonly ClientScope[] = [],
>(
  scopes: AccountScopes<RequiredScopes, LookupScopes> = {},
): DefinedAccount<RequiredScopes[number], LookupScopes[number]> {
  const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
    new ConfigurableModuleBuilder<AccountModuleOptions>()
      .setClassMethodName('forRoot')
      .setExtras<AccountModuleExtras>({ isGlobal: false }, (definition, extras) => ({
        ...definition,
        global: extras.isGlobal,
      }))
      .build();

  abstract class AccountService extends AccountServerToken<
    RequiredScopes[number],
    LookupScopes[number]
  > {}

  @Module({
    providers: [
      {
        provide: AccountService,
        inject: [MODULE_OPTIONS_TOKEN],
        useFactory: (options: AccountModuleOptions) =>
          createAccountServer({ ...options, ...scopes }),
      },
    ],
    exports: [AccountService],
  })
  class AccountModule extends ConfigurableModuleClass {}

  return { AccountModule, AccountService };
}
