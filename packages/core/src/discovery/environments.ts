import { DISCOVERY_PATH, ENVIRONMENTS } from '../constants';

/** A deployment of the Infoteam account IdP that the SDK knows by name. */
export type Environment = keyof typeof ENVIRONMENTS;

/**
 * Where the IdP lives: an {@link Environment} name, or the `https:` origin of another account-be's API.
 */
export type IssuerInput = Environment | (string & {});

/** Returns the OpenID discovery URL of the IdP, which is always served from the API host. */
export function discoveryUrlOf(issuer: IssuerInput): string {
  const base = isEnvironment(issuer) ? ENVIRONMENTS[issuer] : issuer;
  return new URL(DISCOVERY_PATH, base).toString();
}

/** Tells whether `issuer` names a known {@link Environment} rather than an origin. */
export function isEnvironment(issuer: string): issuer is Environment {
  return Object.hasOwn(ENVIRONMENTS, issuer);
}
