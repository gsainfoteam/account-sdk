import * as oauth from 'oauth4webapi';

import { type AccountMetadata } from '../discovery/normalize-discovery';

export interface CreateLogoutUrlParams {
  clientId: string;
  /** 로그아웃 뒤 돌아올 URL. IdP 에 이 client 의 redirect URI 로 등록한 값이어야 한다. */
  postLogoutRedirectUri?: string;
}

/** @returns IdP 가 `end_session_endpoint` 를 광고하지 않으면 `null`. */
export function createLogoutUrl(
  metadata: AccountMetadata,
  params: CreateLogoutUrlParams,
): { url: string; state: string } | null {
  if (!metadata.endSessionEndpoint) return null;

  const state = oauth.generateRandomState();
  const url = new URL(metadata.endSessionEndpoint);

  url.searchParams.set('client_id', params.clientId);
  if (params.postLogoutRedirectUri) {
    url.searchParams.set('post_logout_redirect_uri', params.postLogoutRedirectUri);
    url.searchParams.set('state', state);
  }

  return { url: url.toString(), state };
}
