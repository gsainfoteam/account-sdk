import { DISCOVERY_PATH, ENVIRONMENTS } from '../constants';

/** A deployment of the Infoteam account IdP that the SDK knows by name. */
export type Environment = keyof typeof ENVIRONMENTS;

/**
 * Where the IdP lives: an {@link Environment} name, or the origin of its API such as
 * `http://localhost:3000` for an account-be running locally.
 */
export type IssuerInput = Environment | (string & {});

/** Returns the OpenID discovery URL of the IdP, which is always served from the API host. */
export function discoveryUrlOf(issuer: IssuerInput): string {
  const base = Object.hasOwn(ENVIRONMENTS, issuer) ? ENVIRONMENTS[issuer as Environment] : issuer;
  return new URL(DISCOVERY_PATH, base).toString();
}
