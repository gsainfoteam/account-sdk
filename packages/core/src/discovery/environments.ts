export type Environment = 'production' | 'staging';

export const ENVIRONMENTS: Readonly<Record<Environment, string>> = {
  production: 'https://api.account.gistory.me',
  staging: 'https://api.stg.account.gistory.me',
};

export type IssuerInput = Environment | (string & {});

export function discoveryUrlOf(issuer: IssuerInput): string {
  const base = Object.hasOwn(ENVIRONMENTS, issuer) ? ENVIRONMENTS[issuer as Environment] : issuer;
  return new URL('/.well-known/openid-configuration', base).toString();
}
