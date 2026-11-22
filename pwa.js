// Registers the service worker (sw.js) so the app can be installed and works offline. Not on file://.
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {}));
}

// Keeps the screen on while a page of the app is open (Screen Wake Lock API: Chrome/Android, Safari 16.4+).
// The browser drops the lock whenever the page is hidden, so it is taken again when the page comes back,
// and on the first tap in case the browser wants a user gesture. Silently does nothing where unsupported.
(() => {
  if (!('wakeLock' in navigator)) return;
  let lock = null;
  const keepAwake = async () => {
    if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
    try { lock = await navigator.wakeLock.request('screen'); } catch { /* not allowed right now */ }
  };
  keepAwake();
  document.addEventListener('visibilitychange', keepAwake);
  addEventListener('pointerdown', keepAwake);
  window.__wakeLock = () => !!lock && !lock.released;   // for tests
})();
