import * as oauth from 'oauth4webapi';

import { type AccountMetadata } from '../discovery/normalize-discovery';
import { AccountError } from '../errors/account-error';
import { authorizationServer, oauthClient, toAccountError } from '../internal/oauth4webapi';

/** 검증을 마친 callback URL 에서 꺼낸 값. */
export interface CallbackParams {
  code: string;
  state: string;
  iss?: string;
}

export interface ParseCallbackOptions {
  clientId: string;
  /** 인가를 시작할 때 저장한 state. 이 값이 없으면 callback 을 믿을 수 없다. */
  state: string | null | undefined;
}

/** 트랜잭션을 찾기 위해, 아무것도 검증하지 않고 callback URL 에서 `state` 만 읽는다. */
export function readCallbackState(url: string | URL): string | null {
  return new URL(url).searchParams.get('state');
}

/** URL 에 성공이든 실패든 authorization 응답이 담겨 있는지 알려 준다. */
export function isCallbackUrl(url: string | URL): boolean {
  const params = new URL(url).searchParams;

  return params.has('code') || params.has('error');
}

/**
 * IdP 가 redirect 한 callback 을 검증하고 code 를 돌려준다.
 *
 * `state` 를 가장 먼저 확인한다. 위조된 redirect 는 앱에 에러를 전달하는 것조차 못 하게 하기 위해서다.
 * `iss` 파라미터(RFC 9207)가 있으면 {@link AccountMetadata.issuers} 중 하나여야 한다.
 *
 * @throws {@link AccountError} `state_mismatch`, `issuer_mismatch`, `missing_code`,
 * 또는 `user_cancelled` 처럼 account-fe 가 알려 준 거절 사유.
 */
export function parseCallback(
  metadata: AccountMetadata,
  url: string | URL,
  options: ParseCallbackOptions,
): CallbackParams {
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
    if (error instanceof oauth.OperationProcessingError) {
      throw new AccountError('state_mismatch', { cause: error });
    }

    throw toAccountError(error);
  }
}
