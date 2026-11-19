import { isCallbackUrl, readCallbackState, type OAuthErrorCode } from '@infoteam/account-core';

import { type Redirect } from './options';
import { samePath } from './urls';
import { STORAGE_KEYS } from '../storage/keys';
import { takeTransaction, type StoredTransaction } from '../storage/transactions';

export const SILENT_LOGIN_FAILURES = new Set<string>([
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

/** 라우터가 만들어지기 전에 주소를 바꿔야 라우터가 callback 주소를 라우팅하지 않으므로 동기로 처리한다. */
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
  // MPA가 callback 페이지에 머무는 동안 새로고침해도 쓴 code를 다시 보내지 않게 query를 지운다.
  window.history.replaceState(
    null,
    '',
    navigation === 'document' ? new URL(url).pathname : returnTo,
  );

  return { url, transaction, returnTo };
}
