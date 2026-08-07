import { z } from "zod";

// These schemas describe the *plaintext* content of a vault item — the shape
// that gets JSON.stringify'd and handed to core-crypto's `encryptItem` before
// it ever reaches the network. `vault_items` in Postgres only ever stores the
// resulting ciphertext/nonce/aad (see supabase/migrations/0001_init.sql) plus
// the small amount of metadata below that's genuinely fine to leave
// unencrypted (item type, folder, favorite, timestamps).

export const totpConfigSchema = z.object({
  secret: z.string().min(1), // base32
  algorithm: z.enum(["SHA1", "SHA256", "SHA512"]).default("SHA1"),
  digits: z.number().int().min(6).max(8).default(6),
  period: z.number().int().min(15).max(120).default(30),
});
export type TotpConfig = z.infer<typeof totpConfigSchema>;

export const loginContentSchema = z.object({
  kind: z.literal("login"),
  title: z.string().min(1),
  username: z.string().optional(),
  password: z.string(),
  urls: z.array(z.string()).default([]),
  totp: totpConfigSchema.optional(),
  notes: z.string().optional(),
});
export type LoginContent = z.infer<typeof loginContentSchema>;

export const secureNoteContentSchema = z.object({
  kind: z.literal("note"),
  title: z.string().min(1),
  body: z.string().default(""),
});
export type SecureNoteContent = z.infer<typeof secureNoteContentSchema>;

export const cardContentSchema = z.object({
  kind: z.literal("card"),
  title: z.string().min(1),
  cardholderName: z.string().optional(),
  number: z.string(),
  brand: z.string().optional(),
  expMonth: z.number().int().min(1).max(12).optional(),
  expYear: z.number().int().min(2000).max(2200).optional(),
  cvv: z.string().optional(),
  notes: z.string().optional(),
});
export type CardContent = z.infer<typeof cardContentSchema>;

export const identityContentSchema = z.object({
  kind: z.literal("identity"),
  title: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});
export type IdentityContent = z.infer<typeof identityContentSchema>;

export const vaultItemContentSchema = z.discriminatedUnion("kind", [
  loginContentSchema,
  secureNoteContentSchema,
  cardContentSchema,
  identityContentSchema,
]);
export type VaultItemContent = z.infer<typeof vaultItemContentSchema>;

export const vaultItemTypeSchema = z.enum(["login", "note", "card", "identity"]);
export type VaultItemType = z.infer<typeof vaultItemTypeSchema>;

/** The full client-side record: encrypted-blob metadata (mirrors
 * `vault_items` columns) plus the decrypted `content` once unlocked. `content`
 * is never sent to Supabase — only `ciphertext`/`nonce`/`aad` are. */
export const vaultItemRecordSchema = z.object({
  id: z.string().uuid(),
  vaultId: z.string().uuid(),
  folderId: z.string().uuid().nullable(),
  type: vaultItemTypeSchema,
  favorite: z.boolean().default(false),
  version: z.number().int().min(1).default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  content: vaultItemContentSchema,
});
export type VaultItemRecord = z.infer<typeof vaultItemRecordSchema>;

export const folderSchema = z.object({
  id: z.string().uuid(),
  vaultId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  name: z.string().min(1),
});
export type Folder = z.infer<typeof folderSchema>;
