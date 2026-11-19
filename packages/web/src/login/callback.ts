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

export async function finishCallback(
  context: AccountContext,
  { url, transaction }: Callback,
): Promise<void> {
  const { account } = context;
  const started = context.logouts;
  // 기다리는 동안 logout했으면 떠나지 않는다. 떠나면 IdP 로그아웃으로 가는 이동을 덮어쓴다.
  const leave = () => (context.logouts === started ? leaveCallback(context) : undefined);
  try {
    const params = parseCallback(await context.metadata(), url, {
      clientId: context.clientId,
      state: transaction?.state,
    });
    // web은 항상 openid를 요청하므로 nonce가 없는 transaction은 이 탭이 만든 것이 아니다.
    if (!transaction?.nonce) throw new AccountError('state_mismatch');

    const { codeVerifier, redirectUri: sentRedirectUri, nonce } = transaction;
    await startSession(
      context,
      { code: params.code, codeVerifier, redirectUri: sentRedirectUri, nonce, iss: params.iss },
      undefined,
      started,
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
