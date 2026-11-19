export function onRestoredFromBackForwardCache(listener: () => void): void {
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) listener();
  });
}

export function untilRestoredFromBackForwardCache(): Promise<void> {
  return new Promise((resolve) => {
    const listener = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      window.removeEventListener('pageshow', listener);
      resolve();
    };
    window.addEventListener('pageshow', listener);
  });
}
