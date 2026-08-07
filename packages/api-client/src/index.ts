export { createPasswordManagerClient } from "./client.js";
export type { PasswordManagerClient, ClientConfig } from "./client.js";

export { signUp, signIn, signOut, fetchOwnProfile, fetchKdfParamsForEmail, onAuthStateChange } from "./auth.js";
export type { SignUpParams, KdfParamsForEmail } from "./auth.js";

export {
  createVault,
  listVaults,
  listVaultItems,
  createVaultItem,
  updateVaultItem,
  softDeleteVaultItem,
  createFolder,
  listFolders,
} from "./vaults.js";

export { lookupPublicKey, shareItem, revokeShare, listSharedWithMe, listSharedByMe } from "./sharing.js";

export { subscribeToVaultItems } from "./realtime.js";

export { checkPasswordBreach } from "./edgeFunctions.js";

export type { Database, WrappedPayloadRow, ItemCiphertextRow, VaultItemType, SharePermission, EmergencyAccessStatus } from "./database.types.js";
