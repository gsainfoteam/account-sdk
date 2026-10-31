import { type TokenEndpointAuthMethod } from '@gsainfoteam/account-contract';
import { attemptAsync } from 'es-toolkit';
import * as z from 'zod/mini';

import { CLIENT_REGISTRATION_PATH } from '../constants';
import { type AccountMetadata } from '../discovery/normalize-discovery';
import { AccountError } from '../errors/account-error';
import { type RequestOptions } from '../http/fetch';
import { ClientScopeSchema, type ClientScope } from '../identity/scopes';
import { parse } from '../internal/validate';

const isClientScope = (value: string): value is ClientScope =>
  ClientScopeSchema.safeParse(value).success;

const ClientRegistrationSchema = z.pipe(
  z.looseObject({
    scopes: z.array(z.string()),
    optionalScopes: z.array(z.string()),
    tokenEndpointAuthMethod: z.optional(z.string()),
  }),
  z.transform((raw) => ({
    scopes: raw.scopes.filter(isClientScope),
    optionalScopes: raw.optionalScopes.filter(isClientScope),
    tokenEndpointAuthMethod: raw.tokenEndpointAuthMethod,
  })),
);

export type { TokenEndpointAuthMethod };

/** SDK가 모르는 scope는 버린다. 인증 방식은 새 값이 생겨도 비교만 하므로 문자열 그대로 둔다. */
export type ClientRegistration = z.output<typeof ClientRegistrationSchema>;

/**
 * client 등록 정보는 account-fe 동의 화면에 보이는 값이라, 이 함수는 로그인 없이 부를 수 있다.
 *
 * @throws {@link AccountError} 모르는 client면 `invalid_client`. 요청이 실패하면 `network_error`,
 * 응답이 이상하면 `server_error`.
 */
export async function fetchClientRegistration(
  metadata: AccountMetadata,
  clientId: string,
  options: RequestOptions = {},
): Promise<ClientRegistration> {
  const path = CLIENT_REGISTRATION_PATH.replace('{clientId}', encodeURIComponent(clientId));
  const url = new URL(path, metadata.tokenEndpoint);

  const [error, response] = await attemptAsync(() =>
    (options.fetch ?? globalThis.fetch)(url, {
      headers: { accept: 'application/json' },
      signal: options.signal,
    }),
  );
  if (!response) {
    throw new AccountError('network_error', { description: `GET ${path}`, cause: error });
  }

  if (!response.ok) {
    const code =
      response.status === 404 || response.status === 400 ? 'invalid_client' : 'server_error';
    throw new AccountError(code, { description: `GET ${path}`, status: response.status });
  }

  const [, body] = await attemptAsync<unknown>(() => response.json());

  return parse(ClientRegistrationSchema, body, 'server_error', 'client registration');
}
