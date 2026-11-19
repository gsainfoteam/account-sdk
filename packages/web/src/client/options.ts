import { ClientScopeSchema, type Fetch, type IssuerInput } from '@infoteam/account-core';
import { isFunction, isString } from 'es-toolkit';
import * as z from 'zod/mini';

import { type Session } from '../session/session-adapter';

const nonEmpty = () => z.string().check(z.minLength(1));

export type Redirect = (url: string, options?: { replace?: boolean }) => void;

const SessionPathsSchema = z.object({
  login: z.optional(nonEmpty()),
  refresh: z.optional(nonEmpty()),
  logout: z.optional(nonEmpty()),
});

const isSession = (value: unknown): value is Session =>
  typeof value === 'object' &&
  value !== null &&
  ['start', 'refresh', 'end'].every((key) => isFunction(Reflect.get(value, key)));

export const AccountClientOptionsSchema = z
  .object({
    /** `'production'`, `'staging'`, 또는 다른 account-be 배포의 `https:` API origin이다. */
    issuer: z.custom<IssuerInput>((value) => isString(value) && value.length > 0),
    clientId: nonEmpty(),
    /**
     * [세션 프로토콜](../../README.md#세션-프로토콜)을 구현한 백엔드의 origin이나 `/api` 같은 기본 경로다. endpoint 경로가
     * 다르면 `{ baseUrl, paths }`로 준다. `session`과 함께 줄 수 없다.
     */
    api: z.optional(
      z.union([
        nonEmpty(),
        z.object({ baseUrl: nonEmpty(), paths: z.optional(SessionPathsSchema) }),
      ]),
    ),
    /** 백엔드가 세션 프로토콜과 다른 형식이면 백엔드 호출을 직접 구현해서 준다. `api`와 함께 줄 수 없다. */
    session: z.optional(z.custom<Session>(isSession)),
    redirectUri: z.optional(nonEmpty()),
    app: z.optional(z.enum(['spa', 'mpa'])),
    /** `account.fetch`는 `api` origin(`session`을 주면 페이지 origin)과 이 origin에만 토큰을 붙인다. */
    tokenOrigins: z.optional(z.array(nonEmpty())),
    /**
     * 생략하면 IdP에 등록한 필수 scope와 선택 scope를 모두 요청한다. `openid`는 서비스 백엔드가 id_token으로
     * 사용자를 확인하므로 항상 함께 요청한다.
     */
    scopes: z.optional(z.array(ClientScopeSchema)),
    /**
     * 세션이 없으면 IdP에 `prompt=none`으로 한 번 다녀온다. 탭마다 한 번만 시도하고, 로그아웃한 뒤에는 시도하지
     * 않는다.
     */
    silentLogin: z.optional(z.boolean()),
    fetch: z.optional(z.custom<Fetch>(isFunction)),
    transactionStorage: z.optional(z.custom<Storage>()),
    redirect: z.optional(z.custom<Redirect>(isFunction)),
  })
  .check(
    z.refine((options) => (options.api === undefined) !== (options.session === undefined), {
      message: 'give exactly one of api or session',
    }),
  );

export type AccountClientOptions = z.input<typeof AccountClientOptionsSchema>;
export type ParsedAccountClientOptions = z.output<typeof AccountClientOptionsSchema>;
export type AppKind = NonNullable<ParsedAccountClientOptions['app']>;
