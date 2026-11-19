import { createAccountClient } from '@infoteam/account-react';

export const API_URL = import.meta.env.PUBLIC_API_URL ?? 'http://localhost:4000';

export const account = createAccountClient({
  issuer: import.meta.env.PUBLIC_ACCOUNT_ISSUER ?? 'staging',
  // 빌드 때 서버에서도 옵션을 검사하고, dev 스크립트는 값이 없으면 빈 문자열을 넘기므로 `||`로 자리표시 값을 둔다.
  clientId: import.meta.env.PUBLIC_ACCOUNT_CLIENT_ID || 'set-PUBLIC_ACCOUNT_CLIENT_ID',
  api: API_URL,
  callbackNavigation: 'document',
});
