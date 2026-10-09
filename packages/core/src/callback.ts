import * as oauth from 'oauth4webapi';

import { type AccountMetadata } from './discovery';
import { AccountError } from './errors';
import { authorizationServer, oauthClient, toAccountError } from './oauth';

export interface CallbackParams {
  code: string;
  state: string;
  iss?: string;
}

export interface ParseCallbackOptions {
  clientId: string;
  // signIn 때 저장해 둔 state. 저장된 값이 없으면 검증할 수 없으므로 실패로 본다.
  state: string | null | undefined;
}

export function readCallbackState(url: string | URL): string | null {
  return new URL(url).searchParams.get('state');
}

export function isCallbackUrl(url: string | URL): boolean {
  const params = new URL(url).searchParams;
  return params.has('code') || params.has('error');
}

export function parseCallback(
  metadata: AccountMetadata,
  url: string | URL,
  options: ParseCallbackOptions,
): CallbackParams {
  // oauth4webapi 는 expectedState 를 빼면 state 가 없는 응답을 기대하는 것으로 해석한다.
  if (!options.state) throw new AccountError('state_mismatch');

  const params = new URL(url).searchParams;
  const iss = params.get('iss') ?? undefined;
  const as = authorizationServer(metadata, iss);

  try {
    const validated = oauth.validateAuthResponse(
      as,
      oauthClient(options.clientId),
      params,
      options.state,
    );
    const code = validated.get('code');
    if (!code) throw new AccountError('missing_code');
    return { code, state: options.state, iss };
  } catch (error) {
    // iss 는 위에서 이미 판정했으므로, 여기서 나는 처리 에러는 state 가 없거나 다를 때뿐이다.
    if (error instanceof oauth.OperationProcessingError)
      throw new AccountError('state_mismatch', { cause: error });
    throw toAccountError(error);
  }
}
