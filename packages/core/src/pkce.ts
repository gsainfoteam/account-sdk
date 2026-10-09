import { base64UrlEncode, utf8 } from './encoding';

// 바이트를 그대로 base64url 로 옮긴다. 문자 집합 길이로 나머지 연산을 하면 앞쪽 문자가 더 자주 나온다.
export function randomString(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export interface Pkce {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

export async function createCodeChallenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', utf8(codeVerifier));
  return base64UrlEncode(new Uint8Array(digest));
}

// 32 바이트는 base64url 로 43 자라 RFC 7636 의 최소 길이를 정확히 채운다.
export async function createPkce(): Promise<Pkce> {
  const codeVerifier = randomString(32);
  return {
    codeVerifier,
    codeChallenge: await createCodeChallenge(codeVerifier),
    codeChallengeMethod: 'S256',
  };
}
