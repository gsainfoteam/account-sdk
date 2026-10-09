import { ScopeSchema, type Fetch, type IssuerInput } from '@gsainfoteam/account-core';
import { isFunction, isString } from 'es-toolkit';
import * as z from 'zod/mini';

import { type SessionAdapter } from '../session/session-adapter';

const nonEmpty = () => z.string().check(z.minLength(1));

const method = () => z.custom<(...args: never[]) => unknown>(isFunction);

const SessionAdapterShapeSchema = z.looseObject({
  start: method(),
  refresh: method(),
  end: method(),
});

/** {@link createAccountClient} 의 옵션. 만들 때 검증하므로 환경 변수가 빠져 있으면 앱이 뜰 때 실패한다. */
export const AccountClientOptionsSchema = z.object({
  /** `'production'`, `'staging'`, 또는 다른 account-be 배포의 `https:` API origin. */
  issuer: z.custom<IssuerInput>((value) => isString(value) && value.length > 0),
  clientId: nonEmpty(),
  /** client 에 등록한 callback 경로나 URL. 경로는 현재 origin 기준으로 풀린다. */
  redirectUri: nonEmpty(),
  scopes: z.array(ScopeSchema),
  /**
   * `offline_access` 도 요청한다. 기본은 끔이다. 서비스 백엔드는 IdP 토큰을 로그인할 때 한 번만 쓰고,
   * `offline_access` 를 요청하면 account-fe 가 로그인할 때마다 동의 화면을 띄우기 때문이다.
   */
  offlineAccess: z.optional(z.boolean()),
  /**
   * authorization code 를 누가 교환하는지.
   * - `browser`: 브라우저가 public client 로 교환하고, IdP access token 을 세션에 넘긴다.
   * - `backend`: code 와 PKCE verifier 를 서비스 백엔드에 보내고, 백엔드가 confidential client 로 교환한다.
   */
  exchange: z.enum(['browser', 'backend']),
  /** 서비스 백엔드 세션을 시작, 갱신, 종료하는 방법. {@link cookieSession} 과 {@link bodySession} 을 본다. */
  session: z.custom<SessionAdapter>((value) => SessionAdapterShapeSchema.safeParse(value).success),
  fetch: z.optional(z.custom<Fetch>(isFunction)),
  /** 진행 중인 인가를 보관할 곳. 기본은 `sessionStorage`. */
  transactionStorage: z.optional(z.custom<Storage>()),
  /** IdP 로 이동하는 방법. 기본은 `location.assign`. */
  redirect: z.optional(z.custom<(url: string) => void>(isFunction)),
});

export type AccountClientOptions = z.input<typeof AccountClientOptionsSchema>;
