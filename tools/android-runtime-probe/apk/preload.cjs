// ADR 0131 A1. What the embedder owes a Node 18 runtime: the webcrypto
// global that became automatic in Node 19. The reviewed libsodium's ESM
// build refuses to load without `globalThis.crypto.getRandomValues`, and
// Node 18 has the implementation - just not the global.
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = require('node:crypto').webcrypto;
}
