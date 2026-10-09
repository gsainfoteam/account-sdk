import {
  ClientScopeSchema,
  type ClientScope,
  type Fetch,
  type IssuerInput,
} from '@gsainfoteam/account-core';
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
  requiredScopes: z.optional(z.array(ClientScopeSchema)),
  clientCredentialsScopes: z.optional(z.array(ClientScopeSchema)),
  fetch: z.optional(z.custom<Fetch>(isFunction)),
});

export type AccountServerOptions<
  RequiredScopes extends readonly ClientScope[] = readonly ClientScope[],
  LookupScopes extends readonly ClientScope[] = readonly ClientScope[],
> = Omit<
  z.input<typeof AccountServerOptionsSchema>,
  'requiredScopes' | 'clientCredentialsScopes'
> & {
  /**
   * client 에 필수로 등록한 scope. 이 scope 의 필드는 {@link AccountServer.getUserInfo} 결과에서 필수 타입이 되고,
   * 응답에 빠져 있으면 `missing_claims` 로 실패한다.
   *
   * @remarks
   * 사용자가 거부할 수 있는 선택 scope 는 넣지 않는다. 거부한 사용자는 로그인하지 못하게 된다.
   */
  requiredScopes?: RequiredScopes;
  /**
   * {@link AccountServer.getUserInfoBySub} 가 쓰는 client credentials 토큰의 scope. 이 scope 의 필드는 조회 결과에서
   * 필수 타입이 된다. client 에 등록한 scope 중에서 골라야 하므로 기본값이 없다.
   */
  clientCredentialsScopes?: LookupScopes;
};
