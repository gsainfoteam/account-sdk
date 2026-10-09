import { AccountError, fromOAuthError } from './errors';

export interface CallbackParams {
  code: string;
  state: string;
}

export interface ParseCallbackOptions {
  // signIn 때 저장해 둔 state. 저장된 값이 없으면 검증할 수 없으므로 실패로 본다.
  state: string | null | undefined;
  issuers: readonly string[];
}

export function readCallbackState(url: string | URL): string | null {
  return new URL(url).searchParams.get('state');
}

export function isCallbackUrl(url: string | URL): boolean {
  const params = new URL(url).searchParams;
  return params.has('code') || params.has('error');
}

export function parseCallback(url: string | URL, options: ParseCallbackOptions): CallbackParams {
  const params = new URL(url).searchParams;
  const state = params.get('state');

  // 에러 응답도 state 를 먼저 맞춘다. 공격자가 만든 에러 redirect 로 앱 상태를 흔들 수 없게 한다.
  if (!options.state || state !== options.state) {
    throw new AccountError('state_mismatch');
  }

  const error = params.get('error');
  if (error) throw fromOAuthError(error, params.get('error_description'));

  // RFC 9207. account-be 는 성공 응답에만 iss 를 붙이고 discovery 로 광고하지 않으므로, 있을 때만 검증한다.
  const iss = params.get('iss');
  if (iss !== null && !options.issuers.includes(iss)) {
    throw new AccountError('issuer_mismatch', { description: iss });
  }

  const code = params.get('code');
  if (!code) throw new AccountError('missing_code');

  return { code, state };
}
