import { type AccountContext } from '../client/context';
import { toAccountError } from '../internal/to-account-error';
import { silentLogin } from '../login/authorize';
import { isLoggedOut, watchLogout } from '../logout/logout';

export async function restoreSession(
  context: AccountContext,
  trySilentLogin = context.trySilentLogin,
): Promise<void> {
  const { account } = context;
  if (isLoggedOut(context)) return account.unauthenticate();

  try {
    const loggedOutMeanwhile = watchLogout(context);
    const tokens = await oneAtATime(context, () => context.session.refresh());
    if (loggedOutMeanwhile()) return;
    if (tokens) return account.authenticate(tokens.accessToken);
    if (!trySilentLogin) return account.unauthenticate();

    await silentLogin(context);
    return await restoreSession(context, false);
  } catch (error) {
    account.unauthenticate(toAccountError(error));
  }
}

export function refreshSession(
  context: AccountContext,
  staleToken: string | null,
): Promise<string | null> {
  const { account } = context;
  return oneAtATime(context, async () => {
    try {
      const { accessToken } = account.store.getState();
      if (accessToken && accessToken !== staleToken) return accessToken;

      const loggedOutMeanwhile = watchLogout(context);
      const tokens = !isLoggedOut(context) && (await context.session.refresh());
      if (loggedOutMeanwhile()) return null;
      if (!tokens) {
        account.unauthenticate();
        return null;
      }

      account.authenticate(tokens.accessToken);
      return tokens.accessToken;
    } catch (error) {
      account.unauthenticate(toAccountError(error));
      return null;
    }
  });
}

async function oneAtATime<T>(context: AccountContext, task: () => Promise<T>): Promise<T> {
  await context.refreshMutex.acquire();
  try {
    return await task();
  } finally {
    context.refreshMutex.release();
  }
}
