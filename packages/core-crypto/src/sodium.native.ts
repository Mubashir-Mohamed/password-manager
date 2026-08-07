// React Native adapter — see sodium.ts's header comment for why this file
// exists. Metro (RN's bundler) automatically prefers a `*.native.ts` sibling
// over the plain `*.ts` file for any RN target with ZERO extra resolver
// config; Vite/Node (web/desktop/extension) never see this file at all and
// keep resolving to sodium.ts. That's the one edit this package needed to
// support mobile — everything else (kdf.ts, envelope.ts, keypair.ts, ...)
// imports only from "./sodium.js" and is unaffected by which one loads.
//
// react-native-libsodium ships as an API-compatible drop-in for
// libsodium-wrappers-sumo (same function names/shapes, backed by a native
// module instead of WASM) — see its own docs for exact parity coverage.
// Unverified in this sandbox (no iOS/Android toolchain here to run
// apps/mobile against); treat this file as a real implementation, not a
// stub, but validate the KAT suite from index.test.ts on-device before
// trusting it in production.
import sodium from "react-native-libsodium";

export type Sodium = typeof sodium;

let readyPromise: Promise<Sodium> | null = null;

export function getSodium(): Promise<Sodium> {
  if (!readyPromise) {
    readyPromise = sodium.ready.then(() => sodium);
  }
  return readyPromise;
}
