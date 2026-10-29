import * as oauth from 'oauth4webapi';

import { type AccountMetadata } from '../discovery/normalize-discovery';

export interface CreateLogoutUrlParams {
  clientId: string;
  /** 로그아웃한 뒤 돌아올 URL이다. IdP에 이 client의 redirect URI로 등록한 값이어야 한다. */
  postLogoutRedirectUri?: string;
}

/** @returns IdP가 `end_session_endpoint`를 discovery 문서에 싣지 않으면 `null`. */
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
