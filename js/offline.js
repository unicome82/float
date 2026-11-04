// A secure origin (HTTPS or localhost) is required for offline navigation.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(error => {
      console.warn('FLOAT offline cache could not be prepared:', error);
    });
  });
}
