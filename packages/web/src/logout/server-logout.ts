import { attempt, attemptAsync } from 'es-toolkit';

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

  const send = async (accessToken: string | null, marker: string): Promise<void> => {
    const [notConfirmed] = await attemptAsync(() => session.end(accessToken));
    if (notConfirmed) return retryWhenOnline();

    const markedByThisLogout = flags.getItem(STORAGE_KEYS.logoutUnconfirmed) === marker;
    if (markedByThisLogout) flags.removeItem(STORAGE_KEYS.logoutUnconfirmed);
  };

  const retry = async (): Promise<void> => {
    const marker = flags.getItem(STORAGE_KEYS.logoutUnconfirmed);
    if (marker === null) return;

    await send(null, marker);
  };

  return {
    end(accessToken: string | null): Promise<void> {
      const marker = `${Date.now()}:${Math.random()}`;
      attempt(() => flags.setItem(STORAGE_KEYS.logoutUnconfirmed, marker));

      return send(accessToken, marker);
    },

    retry,
  };
}

export type ServerLogout = ReturnType<typeof createServerLogout>;
