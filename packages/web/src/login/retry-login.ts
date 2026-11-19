import { AccountError } from '@infoteam/account-core';

import { leaveCallback } from './callback';
import { startSession } from './start-session';
import { type AccountContext } from '../client/context';
import { toAccountError } from '../internal/to-account-error';

export async function retryLogin(context: AccountContext, body: unknown): Promise<void> {
  const { account } = context;
  if (account.rejection?.ticket === undefined) {
    throw new AccountError('unauthenticated', { description: 'no login to retry' });
  }

  const started = context.logouts;
  try {
    await startSession(context, { ticket: account.rejection.ticket }, body, started);
  } catch (error) {
    if (context.logouts === started) {
      if (error instanceof AccountError.Expired) account.rejection = null;
      account.unauthenticate(toAccountError(error));
    }
    throw error;
  }

  if (context.logouts !== started) {
    throw new AccountError('unauthenticated', {
      description: 'logged out before the login finished',
    });
  }

  void leaveCallback(context);
}
