import { cookieSession, createAccountClient } from '@gsainfoteam/account-react';

export const account = createAccountClient({
  issuer: import.meta.env.VITE_ACCOUNT_ISSUER ?? 'staging',
  clientId: import.meta.env.VITE_ACCOUNT_CLIENT_ID ?? '',
  redirectUri: '/auth/callback',
  scopes: ['name', 'email'],
  exchange: 'browser',
  session: cookieSession({ baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:4000' }),
});
