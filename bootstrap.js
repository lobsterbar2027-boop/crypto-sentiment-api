// Bootstrap file - applies crypto polyfill before loading the app
// This is necessary because ESM imports are hoisted

import { webcrypto } from 'node:crypto';

// Apply polyfill BEFORE any other modules load
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

// Now dynamically import the main app
const { default: startApp } = await import('./sentiment-api.js');
