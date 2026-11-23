import { type AccountContext } from '../client/context';
import { watchLogout } from '../logout/logout';
import { type LoginCredential } from '../session/session-adapter';
import { STORAGE_KEYS } from '../storage/keys';

export async function startSession(
  context: AccountContext,
  credential: LoginCredential,
  body?: unknown,
  loggedOutMeanwhile = watchLogout(context),
): Promise<void> {
  const result = await context.session.start(credential, body);
  if (loggedOutMeanwhile()) return;

  if ('rejected' in result) {
    context.account.rejection = result.rejected;
    throw result.rejected.error;
  }

  context.flags.removeItem(STORAGE_KEYS.loggedOut);
  context.flags.removeItem(STORAGE_KEYS.logoutUnconfirmed);
  context.account.authenticate(result.tokens.accessToken);
}
