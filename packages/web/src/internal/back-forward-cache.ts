export function onRestoredFromBackForwardCache(listener: () => void): void {
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) listener();
  });
}
