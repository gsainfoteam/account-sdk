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
    /**
     * 기본값은 `/auth/callback`이다. SPA는 client가 이 URL을 라우터보다 먼저 처리하므로 라우트를 만들지 않는다. 끝의
     * `/`는 비교할 때 무시한다.
     */
    redirectUri: z.optional(nonEmpty()),
    /**
     * callback에서 로그인 전 위치로 돌아가는 방법이다. 기본값 `'history'`는 주소만 바꾸고 SPA 라우터가 그 주소를
     * 그린다. 페이지마다 문서를 새로 받는 앱(Astro 같은 MPA)은 `'document'`를 주고 callback 페이지를 만든다. 그러면
     * 로그인을 마친 뒤 그 위치를 새로 불러오고, 실패하면 callback 페이지에 머물러 에러를 보여 줄 수 있다.
     */
    callbackNavigation: z.optional(z.enum(['history', 'document'])),
    /**
     * `account.fetch`가 access token을 붙이고 401에 refresh 하는 origin이다. `api`의 origin(`session`을 주면 페이지
     * origin)에 더한다. 그 밖의 URL은 토큰 없이 그대로 보내서 다른 사이트로 토큰이 새지 않게 한다.
     */
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
    /** `replace`이면 지금 페이지를 방문 기록에 남기지 않는다. */
    redirect: z.optional(z.custom<Redirect>(isFunction)),
  })
  .check(
    z.refine((options) => (options.api === undefined) !== (options.session === undefined), {
      message: 'give exactly one of api or session',
    }),
  );

export type AccountClientOptions = z.input<typeof AccountClientOptionsSchema>;
