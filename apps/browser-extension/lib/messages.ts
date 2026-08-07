// Message-passing contract between popup / content script / background
// service worker — the three run in separate execution contexts under MV3
// and can only communicate this way (mobile design plan §3 "Architecture
// Components"). Content scripts never touch crypto directly; they always ask
// the background worker for the specific credential they need.

export interface MatchRequest {
  type: "vault:match-domain";
  domain: string;
}

export interface MatchResponse {
  matches: Array<{ itemId: string; title: string; username?: string }>;
}

export interface FillRequest {
  type: "vault:fill-item";
  itemId: string;
}

export interface FillResponse {
  username?: string;
  password: string;
}

export interface LockStateRequest {
  type: "vault:lock-state";
}

export interface LockStateResponse {
  unlocked: boolean;
}

export type ExtensionMessage = MatchRequest | FillRequest | LockStateRequest;
