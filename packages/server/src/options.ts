import {
  ClientScopeSchema,
  type ClientScope,
  type Fetch,
  type IssuerInput,
} from '@gsainfoteam/account-core';
import { isFunction, isString } from 'es-toolkit';
import * as z from 'zod/mini';

const nonEmpty = () => z.string().check(z.minLength(1));

/** 값은 보통 환경 변수에서 오므로, 첫 요청이 아니라 서버가 시작될 때 검증한다. */
export const AccountServerOptionsSchema = z.object({
  /** `'production'`, `'staging'`, 또는 다른 account-be 배포의 `https:` API origin 중 하나다. */
  issuer: z.custom<IssuerInput>((value) => isString(value) && value.length > 0),
  clientId: nonEmpty(),
  /** {@link AccountServer.loginWithCode}와 {@link AccountServer.getUserInfoBySub}에 필요하다. */
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
   * 이 scope의 claim이 id_token에 빠져 있으면 로그인이 `missing_claims`로 실패한다. 선택 scope를 넣으면 그 scope를
   * 거부한 사용자는 로그인하지 못한다.
   */
  requiredScopes?: RequiredScopes;
  /** client에 등록한 scope 중에서 골라야 하므로 기본값이 없다. */
  clientCredentialsScopes?: LookupScopes;
};
