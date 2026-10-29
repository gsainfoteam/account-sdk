import { createAccountClient } from '@gsainfoteam/account-react';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export const account = createAccountClient({
  issuer: import.meta.env.VITE_ACCOUNT_ISSUER ?? 'staging',
  clientId: import.meta.env.VITE_ACCOUNT_CLIENT_ID ?? '',
  api: API_URL,
});
