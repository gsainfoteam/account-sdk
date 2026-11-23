import { createLogoutUrl } from '@infoteam/account-core';

import { type AccountContext } from '../client/context';
import { type LogoutOptions } from '../client/types';
import { sameOriginPath } from '../internal/urls';
import { STORAGE_KEYS } from '../storage/keys';

export function isLoggedOut({ flags }: AccountContext): boolean {
  return flags.getItem(STORAGE_KEYS.loggedOut) !== null;
}

export function watchLogout(context: AccountContext): () => boolean {
  const before = context.logouts;
  return () => context.logouts !== before;
}

export async function logout(
  context: AccountContext,
  { idp = false, returnTo = '/' }: LogoutOptions = {},
): Promise<void> {
  const { account } = context;
  const { accessToken } = account.store.getState();

  account.rejection = null;
  context.logouts += 1;
  context.flags.setItem(STORAGE_KEYS.loggedOut, '1');

  const ending = endSession(context, accessToken, idp, returnTo);
  context.logoutGate.track(ending);
  account.unauthenticate(null);
  await ending;
}

async function endSession(
  context: AccountContext,
  accessToken: string | null,
  idp: boolean,
  returnTo: string,
): Promise<boolean> {
  await context.serverLogout.end(accessToken);
  if (!idp || !context.canRoundTrip) return false;

  const logout = createLogoutUrl(await context.metadata(), {
    clientId: context.clientId,
    postLogoutRedirectUri: context.redirectUri(),
  });
  if (!logout) return false;

  context.transactions.setItem(
    STORAGE_KEYS.logoutPrefix + logout.state,
    sameOriginPath(returnTo) ?? '/',
  );
  context.redirect(logout.url);
  return true;
}
