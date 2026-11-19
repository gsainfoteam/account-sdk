import {
  AccountError,
  isCallbackUrl,
  parseCallback,
  readCallbackState,
  type OAuthErrorCode,
} from '@infoteam/account-core';

import { startSession } from './start-session';
import { type AccountContext } from '../client/context';
import { type Redirect } from '../client/options';
import { toAccountError } from '../internal/to-account-error';
import { samePath } from '../internal/urls';
import { watchLogout } from '../logout/logout';
import { STORAGE_KEYS } from '../storage/keys';
import { takeTransaction, type StoredTransaction } from '../storage/transactions';

const SILENT_LOGIN_FAILURES = new Set<string>([
  'login_required',
  'consent_required',
  'interaction_required',
] satisfies OAuthErrorCode[]);

export interface Callback {
  url: string;
  transaction: StoredTransaction | null;
  returnTo: string;
}

interface CallbackContext {
  redirectUri: string;
  transactions: Storage;
  navigation: 'history' | 'document';
  redirect: Redirect;
}

export function takeCallback({
  redirectUri,
  transactions,
  navigation,
  redirect,
}: CallbackContext): Callback | null {
  const url = window.location.href;
  if (!samePath(new URL(url).pathname, new URL(redirectUri).pathname)) return null;

  const logoutKey = STORAGE_KEYS.logoutPrefix + readCallbackState(url);
  const afterLogout = transactions.getItem(logoutKey);
  if (afterLogout !== null && !isCallbackUrl(url)) {
    transactions.removeItem(logoutKey);
    if (navigation === 'document') redirect(afterLogout, { replace: true });
    else window.history.replaceState(null, '', afterLogout);
    return null;
  }

  if (!isCallbackUrl(url)) return null;

  const transaction = takeTransaction(transactions, readCallbackState(url));
  const returnTo = transaction?.returnTo ?? '/';
  const addressWithoutCode = navigation === 'document' ? new URL(url).pathname : returnTo;
  window.history.replaceState(null, '', addressWithoutCode);

  return { url, transaction, returnTo };
}

export async function finishCallback(
  context: AccountContext,
  { url, transaction }: Callback,
): Promise<void> {
  const { account } = context;
  const loggedOutMeanwhile = watchLogout(context);
  const leave = () => (loggedOutMeanwhile() ? undefined : leaveCallback(context));
  try {
    const params = parseCallback(await context.metadata(), url, {
      clientId: context.clientId,
      state: transaction?.state,
    });
    if (!transaction?.nonce) throw new AccountError('state_mismatch');

    const { codeVerifier, redirectUri: sentRedirectUri, nonce } = transaction;
    await startSession(
      context,
      { code: params.code, codeVerifier, redirectUri: sentRedirectUri, nonce, iss: params.iss },
      undefined,
      loggedOutMeanwhile,
    );
  } catch (error) {
    const accountError = toAccountError(error);
    if (transaction?.silent && SILENT_LOGIN_FAILURES.has(accountError.code)) {
      account.unauthenticate();
      return leave();
    }

    account.callbackError = accountError;
    account.unauthenticate(account.callbackError);
    return;
  }

  return leave();
}

export function leaveCallback({
  navigation,
  callback,
  redirect,
}: AccountContext): Promise<never> | undefined {
  if (navigation !== 'document' || !callback) return undefined;

  redirect(callback.returnTo, { replace: true });
  return new Promise<never>(() => undefined);
}
