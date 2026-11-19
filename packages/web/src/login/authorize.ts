import {
  AccountError,
  createAuthorization,
  OPENID_SCOPE,
  type Prompt,
} from '@infoteam/account-core';

import { type AccountContext } from '../client/context';
import { type LoginOptions } from '../client/types';
import { toAccountError } from '../internal/to-account-error';
import { sameOriginPath } from '../internal/urls';
import { STORAGE_KEYS } from '../storage/keys';
import { saveTransaction } from '../storage/transactions';

export async function login(
  context: AccountContext,
  { returnTo = window.location.href, prompt }: LoginOptions = {},
): Promise<void> {
  if (await context.logoutGate.isLeaving()) return;

  try {
    if (!context.canRoundTrip) {
      throw new AccountError('unknown', {
        description: 'site storage is blocked, so the login cannot come back to this page',
      });
    }
    await authorize(context, returnTo, prompt, false);
  } catch (error) {
    const accountError = toAccountError(error);
    context.account.store.setState({ error: accountError });
    throw accountError;
  }
}

export async function silentLogin(context: AccountContext): Promise<never> {
  context.transactions.setItem(STORAGE_KEYS.silentLoginTried, '1');
  await authorize(context, window.location.href, 'none', true);
  return new Promise<never>(() => undefined);
}

async function authorize(
  context: AccountContext,
  returnTo: string,
  prompt: Prompt | undefined,
  silent: boolean,
): Promise<void> {
  const loggedOut = context.flags.getItem(STORAGE_KEYS.loggedOut) !== null;
  const { url, transaction } = await createAuthorization(await context.metadata(), {
    clientId: context.clientId,
    redirectUri: context.redirectUri(),
    scopes: [OPENID_SCOPE, ...(await context.scopes())],
    prompt: prompt ?? (loggedOut ? 'login' : undefined),
  });
  if (await context.logoutGate.isLeaving()) return;

  saveTransaction(context.transactions, transaction, {
    returnTo: sameOriginPath(returnTo),
    silent,
  });
  context.redirect(url);
}
