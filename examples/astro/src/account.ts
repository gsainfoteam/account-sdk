import { createAccountClient } from '@infoteam/account-react';

export const API_URL = import.meta.env.PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Astro는 island를 서버에서도 렌더링하므로 빌드할 때 이 모듈이 실행된다. 서버에서는 세션 없는 client가 만들어지지만
 * 옵션 검사는 그대로 하므로, client ID가 없어도 빌드되게 자리표시 값을 둔다.
 */
export const account = createAccountClient({
  issuer: import.meta.env.PUBLIC_ACCOUNT_ISSUER ?? 'staging',
  // dev 스크립트는 .env에 client id가 없으면 빈 문자열을 넘기므로 `??`가 아니라 `||`로 받는다.
  clientId: import.meta.env.PUBLIC_ACCOUNT_CLIENT_ID || 'set-PUBLIC_ACCOUNT_CLIENT_ID',
  api: API_URL,
  callbackNavigation: 'document',
});
