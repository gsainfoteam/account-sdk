/** IdP 로그아웃으로 떠나는 중에 login()이 redirect 하면 그 이동을 덮어쓰므로, 로그아웃이 끝날 때까지 막는다. */
export function createLogoutGate() {
  let pending: Promise<boolean> | undefined;

  // IdP 로그아웃 화면에서 뒤로 가기로 bfcache가 페이지를 되살리면 떠나던 로그아웃은 이미 끝났다.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) pending = undefined;
  });

  return {
    /** 뒤의 로그아웃이 먼저 끝나도 앞선 IdP 로그아웃을 계속 기다려야 하므로 앞의 것과 묶는다. */
    track(ending: Promise<boolean>): void {
      const leaving = ending.catch(() => false);
      const previous = pending;
      const waiting = previous
        ? Promise.all([previous, leaving]).then(([before, now]) => before || now)
        : leaving;

      pending = waiting;
      void waiting.then((left) => {
        if (!left && pending === waiting) pending = undefined;
      });
    },

    async isLeaving(): Promise<boolean> {
      // 기다리는 동안 IdP 로그아웃이 새로 시작될 수 있으므로, 더 늘어나지 않을 때까지 따라간다.
      let waiting = pending;
      while (waiting) {
        if (await waiting) return true;
        waiting = pending === waiting ? undefined : pending;
      }
      return false;
    },
  };
}

export type LogoutGate = ReturnType<typeof createLogoutGate>;
