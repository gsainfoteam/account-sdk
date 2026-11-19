import { AccountError } from '@infoteam/account-core';

import { leaveCallback } from './callback';
import { startSession } from './start-session';
import { type AccountContext } from '../client/context';
import { toAccountError } from '../internal/to-account-error';
import { watchLogout } from '../logout/logout';

export async function retryLogin(context: AccountContext, body: unknown): Promise<void> {
  const { account } = context;
  if (account.rejection?.ticket === undefined) {
    throw new AccountError('unauthenticated', { description: 'no login to retry' });
  }

  const loggedOutMeanwhile = watchLogout(context);
  try {
    await startSession(context, { ticket: account.rejection.ticket }, body, loggedOutMeanwhile);
  } catch (error) {
    const accountError = toAccountError(error);
    if (!loggedOutMeanwhile()) {
      if (accountError instanceof AccountError.Expired) account.rejection = null;
      account.unauthenticate(accountError);
    }
    throw accountError;
  }

  if (loggedOutMeanwhile()) {
    throw new AccountError('unauthenticated', {
      description: 'logged out before the login finished',
    });
  }

  void leaveCallback(context);
}
