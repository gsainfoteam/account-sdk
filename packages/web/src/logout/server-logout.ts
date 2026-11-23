import { attemptAsync } from 'es-toolkit';

import { type Session } from '../session/session-adapter';
import { STORAGE_KEYS } from '../storage/keys';

export function createServerLogout(session: Session, flags: Storage) {
  let waitingForNetwork = false;

  const retryWhenOnline = () => {
    if (waitingForNetwork) return;

    waitingForNetwork = true;
    window.addEventListener(
      'online',
      () => {
        waitingForNetwork = false;
        void retry();
      },
      { once: true },
    );
  };

  const send = async (accessToken: string | null): Promise<void> => {
    const [notConfirmed] = await attemptAsync(() => session.end(accessToken));
    if (notConfirmed) return retryWhenOnline();

    flags.removeItem(STORAGE_KEYS.logoutUnconfirmed);
  };

  const retry = async (): Promise<void> => {
    if (flags.getItem(STORAGE_KEYS.logoutUnconfirmed) === null) return;

    await send(null);
  };

  return {
    end(accessToken: string | null): Promise<void> {
      flags.setItem(STORAGE_KEYS.logoutUnconfirmed, '1');
      return send(accessToken);
    },

    retry,
  };
}

export type ServerLogout = ReturnType<typeof createServerLogout>;
