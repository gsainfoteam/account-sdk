import { ClientScopeSchema, type Fetch, type IssuerInput } from '@gsainfoteam/account-core';
import { isFunction, isString } from 'es-toolkit';
import * as z from 'zod/mini';

const nonEmpty = () => z.string().check(z.minLength(1));

const SessionPathsSchema = z.object({
  login: z.optional(nonEmpty()),
  refresh: z.optional(nonEmpty()),
  logout: z.optional(nonEmpty()),
});

export const AccountClientOptionsSchema = z.object({
  /** `'production'`, `'staging'`, 또는 다른 account-be 배포의 `https:` API origin이다. */
  issuer: z.custom<IssuerInput>((value) => isString(value) && value.length > 0),
  clientId: nonEmpty(),
  /**
   * `@gsainfoteam/account-nest` 세션 모듈의 `/auth/*` 앞에 붙는 origin이나 `/api` 같은 기본 경로다. endpoint 경로가
   * 다르면 `{ baseUrl, paths }`로 준다.
   */
  api: z.union([
    nonEmpty(),
    z.object({ baseUrl: nonEmpty(), paths: z.optional(SessionPathsSchema) }),
  ]),
  /** 기본값은 `/auth/callback`이다. client가 이 URL을 라우터보다 먼저 처리하므로 라우트를 만들지 않는다. */
  redirectUri: z.optional(nonEmpty()),
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
  redirect: z.optional(z.custom<(url: string) => void>(isFunction)),
});

export type AccountClientOptions = z.input<typeof AccountClientOptionsSchema>;
