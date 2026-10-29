import { DISCOVERY_PATH, ENVIRONMENTS } from '../constants';

export type Environment = keyof typeof ENVIRONMENTS;

/** {@link Environment} 이름이거나, 다른 account-be 배포의 `https:` API origin 이다. */
export type IssuerInput = Environment | (string & {});

export function discoveryUrlOf(issuer: IssuerInput): string {
  const base = isEnvironment(issuer) ? ENVIRONMENTS[issuer] : issuer;
  return new URL(DISCOVERY_PATH, base).toString();
}

export function isEnvironment(issuer: string): issuer is Environment {
  return Object.hasOwn(ENVIRONMENTS, issuer);
}
