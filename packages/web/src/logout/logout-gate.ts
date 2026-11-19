import { onRestoredFromBackForwardCache } from '../internal/back-forward-cache';

export function createLogoutGate() {
  let pending: Promise<boolean> | undefined;

  onRestoredFromBackForwardCache(() => {
    pending = undefined;
  });

  return {
    track(ending: Promise<boolean>): void {
      const leaving = ending.catch(() => false);
      const earlier = pending;
      const waiting = earlier
        ? Promise.all([earlier, leaving]).then(([earlierLeft, left]) => earlierLeft || left)
        : leaving;

      pending = waiting;
      void waiting.then((left) => {
        if (!left && pending === waiting) pending = undefined;
      });
    },

    async isLeaving(): Promise<boolean> {
      let waiting = pending;
      while (waiting) {
        if (await waiting) return true;
        const startedWhileWaiting = pending !== waiting;
        waiting = startedWhileWaiting ? pending : undefined;
      }
      return false;
    },
  };
}

export type LogoutGate = ReturnType<typeof createLogoutGate>;
