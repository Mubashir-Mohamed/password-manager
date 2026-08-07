// Platform-adapter seam (see build plan §1 "Crypto library standardization").
//
// Web, Electron (desktop), and the browser extension all run in a DOM/Node-like
// environment and share this WASM build of libsodium. React Native cannot load
// libsodium-wrappers-sumo's WASM binary the same way — the mobile team should
// implement `getSodium()` in a `sodium.native.ts` sibling backed by
// `react-native-libsodium`, which exposes the same function names/shapes, and
// wire `apps/mobile`'s bundler to resolve that file instead of this one
// (Metro `resolver.sourceExts`/platform extensions, e.g. `sodium.native.ts`).
//
// Every other module in this package imports ONLY from here — never straight
// from "libsodium-wrappers-sumo" — so that swap is the single edit mobile needs.
import _sodium from "libsodium-wrappers-sumo";

export type Sodium = typeof _sodium;

let readyPromise: Promise<Sodium> | null = null;

/** Lazily initializes libsodium's WASM module. Safe to call repeatedly — the
 * underlying `sodium.ready` promise is memoized. */
export function getSodium(): Promise<Sodium> {
  if (!readyPromise) {
    readyPromise = _sodium.ready.then(() => _sodium);
  }
  return readyPromise;
}
