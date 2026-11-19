import { type AccountContext } from '../client/context';
import { toAccountError } from '../internal/to-account-error';
import { silentLogin } from '../login/authorize';
import { STORAGE_KEYS } from '../storage/keys';

export async function restoreSession(context: AccountContext): Promise<void> {
  const { account } = context;
  // logout이 서버에 닿지 못했으면 refresh 쿠키가 남아 있으므로, 다시 로그인하기 전에는 쓰지 않는다.
  if (context.flags.getItem(STORAGE_KEYS.loggedOut) !== null) return account.unauthenticate();

  try {
    const started = context.logouts;
    const tokens = await oneAtATime(context, () => context.session.refresh());
    if (context.logouts !== started) return;
    if (tokens) return account.authenticate(tokens.accessToken);

    if (context.trySilentLogin) return await silentLogin(context);

    account.unauthenticate();
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

      const started = context.logouts;
      const tokens =
        context.flags.getItem(STORAGE_KEYS.loggedOut) === null && (await context.session.refresh());
      if (context.logouts !== started) return null;
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
