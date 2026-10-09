import { ScopeSchema, type Fetch, type IssuerInput } from '@gsainfoteam/account-core';
import { isFunction, isString } from 'es-toolkit';
import * as z from 'zod/mini';

const nonEmpty = () => z.string().check(z.minLength(1));

/**
 * {@link createAccountServer} 의 옵션.
 *
 * 값은 보통 환경 변수에서 오므로, 첫 요청이 아니라 서버가 뜰 때 검증한다.
 */
export const AccountServerOptionsSchema = z.object({
  /** `'production'`, `'staging'`, 또는 다른 account-be 배포의 `https:` API origin. */
  issuer: z.custom<IssuerInput>((value) => isString(value) && value.length > 0),
  clientId: nonEmpty(),
  /** {@link AccountServer.exchangeCode} 와 {@link AccountServer.getUserInfoBySub} 에 필요하다. IdP 토큰 확인은 없어도 된다. */
  clientSecret: z.optional(nonEmpty()),
  /**
   * {@link AccountServer.getUserInfoBySub} 가 쓰는 client credentials 토큰의 scope.
   * client 에 등록한 scope 중에서 골라야 하므로 기본값이 없다.
   */
  clientCredentialsScopes: z.optional(z.array(ScopeSchema)),
  fetch: z.optional(z.custom<Fetch>(isFunction)),
});

export type AccountServerOptions = z.input<typeof AccountServerOptionsSchema>;
