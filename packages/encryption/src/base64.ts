/**
 * Isomorphic base64 helpers (no Node `Buffer`), so the same code runs in Node,
 * the browser, and edge runtimes. `btoa`/`atob` are global in Node 18+ and in
 * browsers.
 *
 * NOTE: the standard `Uint8Array.fromBase64`/`toBase64` methods would let us
 * delete this file, but as of Node 24 they are still behind the experimental
 * V8 flag `--js-base-64` and are not available by default. Revisit when they
 * ship unflagged.
 */

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
