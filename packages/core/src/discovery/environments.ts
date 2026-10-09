import { DISCOVERY_PATH, ENVIRONMENTS } from '../constants';

export type Environment = keyof typeof ENVIRONMENTS;

export type IssuerInput = Environment | (string & {});

export function discoveryUrlOf(issuer: IssuerInput): string {
  const base = Object.hasOwn(ENVIRONMENTS, issuer) ? ENVIRONMENTS[issuer as Environment] : issuer;
  return new URL(DISCOVERY_PATH, base).toString();
}
