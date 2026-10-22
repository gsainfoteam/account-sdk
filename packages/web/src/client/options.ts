import { ClientScopeSchema, type Fetch, type IssuerInput } from '@gsainfoteam/account-core';
import { isFunction, isString } from 'es-toolkit';
import * as z from 'zod/mini';

const nonEmpty = () => z.string().check(z.minLength(1));

const SessionPathsSchema = z.object({
  login: z.optional(nonEmpty()),
  refresh: z.optional(nonEmpty()),
  logout: z.optional(nonEmpty()),
});

/** {@link createAccountClient} 의 옵션. 만들 때 검증하므로 환경 변수가 빠져 있으면 앱이 뜰 때 실패한다. */
export const AccountClientOptionsSchema = z.object({
  /** `'production'`, `'staging'`, 또는 다른 account-be 배포의 `https:` API origin. */
  issuer: z.custom<IssuerInput>((value) => isString(value) && value.length > 0),
  clientId: nonEmpty(),
  /**
   * 서비스 백엔드. `@gsainfoteam/account-nest` 세션 모듈의 `/auth/login`, `/auth/refresh`, `/auth/logout` 을 부른다.
   * origin 이나 `/api` 같은 기본 경로이고, endpoint 경로가 다르면 `{ baseUrl, paths }` 로 준다.
   */
  api: z.union([
    nonEmpty(),
    z.object({ baseUrl: nonEmpty(), paths: z.optional(SessionPathsSchema) }),
  ]),
  /**
   * IdP 에 등록한 callback 경로나 URL. 경로는 현재 origin 기준으로 풀린다. 기본은 `/auth/callback`.
   * client 가 이 URL 을 라우터보다 먼저 처리하므로 라우트를 만들지 않는다.
   */
  redirectUri: z.optional(nonEmpty()),
  /**
   * 요청할 scope. 생략하면 IdP 에 등록한 필수와 선택 scope 전부다. `openid` 는 항상 함께 요청한다.
   * 서비스 백엔드가 id_token 으로 사용자를 확인하기 때문이다.
   */
  scopes: z.optional(z.array(ClientScopeSchema)),
  fetch: z.optional(z.custom<Fetch>(isFunction)),
  /** 진행 중인 인가를 보관할 곳. 기본은 `sessionStorage`. */
  transactionStorage: z.optional(z.custom<Storage>()),
  /** IdP 로 이동하는 방법. 기본은 `location.assign`. */
  redirect: z.optional(z.custom<(url: string) => void>(isFunction)),
});

export type AccountClientOptions = z.input<typeof AccountClientOptionsSchema>;
