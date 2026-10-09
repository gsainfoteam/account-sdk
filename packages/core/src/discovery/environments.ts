import { DISCOVERY_PATH, ENVIRONMENTS } from '../constants';

/** SDK 가 이름으로 아는 인포팀 계정 IdP 배포. */
export type Environment = keyof typeof ENVIRONMENTS;

/**
 * IdP 위치. {@link Environment} 이름이거나, 다른 account-be 배포의 `https:` API origin 이다.
 */
export type IssuerInput = Environment | (string & {});

/** IdP 의 OpenID discovery URL 을 돌려준다. discovery 는 항상 API 호스트에서 제공된다. */
export function discoveryUrlOf(issuer: IssuerInput): string {
  const base = isEnvironment(issuer) ? ENVIRONMENTS[issuer] : issuer;
  return new URL(DISCOVERY_PATH, base).toString();
}

/** `issuer` 가 origin 이 아니라 알려진 {@link Environment} 이름인지 알려 준다. */
export function isEnvironment(issuer: string): issuer is Environment {
  return Object.hasOwn(ENVIRONMENTS, issuer);
}
