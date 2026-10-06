// Keeping the world in the browser, and world codes (gzipped saves) for
// copying, downloading and loading.

import { World } from '../world/world.js';

const STORE = 'awfully-long-earth:climate-2000';

export async function gzip(str) {
  if (typeof CompressionStream === 'undefined') return 'raw:' + str;
  const cs = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(cs).arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return 'gz:' + btoa(s);
}

export async function gunzip(code) {
  if (code.startsWith('raw:')) return code.slice(4);
  if (!code.startsWith('gz:')) return code;
  const bin = atob(code.slice(3));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(ds).text();
}

export const worldCode = (world) => gzip(world.serialize());
export async function worldFromCode(code) { return World.deserialize(await gunzip(code)); }

// Debounced autosave; onFail is called if the browser refuses to store it.
export function autosaver(getWorld, onFail) {
  let timer = 0;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        localStorage.setItem(STORE, await worldCode(getWorld()));
      } catch (e) {
        onFail(e);
      }
    }, 600);
  };
}

export async function loadSaved() {
  try {
    const code = localStorage.getItem(STORE);
    if (!code) return null;
    return await worldFromCode(code);
  } catch (e) {
    return null;
  }
}
