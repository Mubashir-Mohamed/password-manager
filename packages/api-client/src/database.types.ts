// Hand-written to match supabase/migrations/0001_init.sql + 0002_*.sql.
//
// TODO once a real Supabase project exists: replace this file with the
// output of `supabase gen types typescript --project-id <ref> > src/database.types.ts`
// and keep it regenerated on every migration change (wire into CI — build
// plan §7). Hand-maintaining this is a Phase 1 stopgap only.
//
// Row/Insert/Update are spelled out independently per table (not derived from
// one another via Pick/Omit self-reference) — matching the shape
// `supabase gen types` itself emits. A self-referential derived version was
// tried first and broke @supabase/postgrest-js's conditional-type inference
// (every `.insert()`/`.update()` call resolved to `never` instead of the real
// row type) — verified against the installed postgrest-js 2.112.2 typings.

export interface WrappedPayloadRow {
  nonce: string;
  ciphertext: string;
}

export interface ItemCiphertextRow {
  nonce: string;
  ciphertext: string;
  aad: string;
}

export type VaultItemType = "login" | "note" | "card" | "identity";
export type SharePermission = "read" | "write";
export type EmergencyAccessStatus =
  | "invited"
  | "accepted"
  | "recovery_requested"
  | "recovery_approved"
  | "recovery_rejected";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          kdf_algo: string;
          kdf_salt: string;
          kdf_memlimit: number;
          kdf_opslimit: number;
          kdf_version: number;
          wrapped_vault_key: WrappedPayloadRow;
          public_key: string;
          wrapped_private_key: WrappedPayloadRow;
          secret_key_marker: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          kdf_algo?: string;
          kdf_salt: string;
          kdf_memlimit: number;
          kdf_opslimit: number;
          kdf_version?: number;
          wrapped_vault_key: WrappedPayloadRow;
          public_key: string;
          wrapped_private_key: WrappedPayloadRow;
          secret_key_marker?: string | null;
        };
        Update: {
          email?: string;
          display_name?: string | null;
          kdf_salt?: string;
          kdf_memlimit?: number;
          kdf_opslimit?: number;
          kdf_version?: number;
          wrapped_vault_key?: WrappedPayloadRow;
          public_key?: string;
          wrapped_private_key?: WrappedPayloadRow;
          secret_key_marker?: string | null;
        };
        Relationships: [];
      };
      vaults: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          type: "personal";
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name?: string;
          type?: "personal";
        };
        Update: {
          name?: string;
        };
        Relationships: [];
      };
      folders: {
        Row: {
          id: string;
          vault_id: string;
          parent_id: string | null;
          name_encrypted: ItemCiphertextRow;
          created_at: string;
        };
        Insert: {
          id?: string;
          vault_id: string;
          parent_id?: string | null;
          name_encrypted: ItemCiphertextRow;
        };
        Update: {
          parent_id?: string | null;
          name_encrypted?: ItemCiphertextRow;
        };
        Relationships: [];
      };
      vault_items: {
        Row: {
          id: string;
          vault_id: string;
          folder_id: string | null;
          type: VaultItemType;
          wrapped_item_key: WrappedPayloadRow;
          content: ItemCiphertextRow;
          domain_hmac: string | null;
          favorite: boolean;
          is_deleted: boolean;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vault_id: string;
          folder_id?: string | null;
          type: VaultItemType;
          wrapped_item_key: WrappedPayloadRow;
          content: ItemCiphertextRow;
          domain_hmac?: string | null;
          favorite?: boolean;
          is_deleted?: boolean;
          version?: number;
        };
        Update: {
          folder_id?: string | null;
          wrapped_item_key?: WrappedPayloadRow;
          content?: ItemCiphertextRow;
          domain_hmac?: string | null;
          favorite?: boolean;
          is_deleted?: boolean;
          version?: number;
        };
        Relationships: [];
      };
      shared_items: {
        Row: {
          id: string;
          item_id: string;
          from_user_id: string;
          to_user_id: string;
          wrapped_item_key: WrappedPayloadRow;
          // Sender's X25519 public key at share time — see
          // 0005_shared_items_sender_public_key.sql for why this is
          // denormalized here rather than looked up from profiles.
          from_public_key: string;
          // Recipient's email at share time — see
          // 0008_shared_items_recipient_email_and_dedup.sql for why this is
          // denormalized here rather than looked up from profiles.
          to_email: string;
          permission: SharePermission;
          created_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          item_id: string;
          from_user_id: string;
          to_user_id: string;
          wrapped_item_key: WrappedPayloadRow;
          from_public_key: string;
          to_email: string;
          permission?: SharePermission;
        };
        Update: {
          revoked_at?: string | null;
          // 0008's partial unique index (one active share per item+recipient)
          // means "share again at a different permission level" is an UPDATE
          // of this column on the existing row, not a second INSERT.
          permission?: SharePermission;
        };
        Relationships: [];
      };
      devices: {
        Row: {
          id: string;
          user_id: string;
          name: string | null;
          platform: string | null;
          last_seen_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name?: string | null;
          platform?: string | null;
          last_seen_at?: string | null;
        };
        Update: {
          name?: string | null;
          platform?: string | null;
          last_seen_at?: string | null;
        };
        Relationships: [];
      };
      emergency_access: {
        Row: {
          id: string;
          grantor_id: string;
          grantee_id: string;
          status: EmergencyAccessStatus;
          wait_time_days: number;
          // wrapped_vault_key_for_grantee is deliberately absent here — see
          // the migration's column-level GRANT allowlist. Only the
          // `get_emergency_vault_key` RPC can read it.
          requested_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          grantor_id: string;
          grantee_id: string;
          wait_time_days?: number;
        };
        // No client-facing UPDATE policy — see 0001_init.sql. Modeled as an
        // empty-only update (no columns) rather than `never`, so `.update({})`
        // still typechecks as a no-op instead of poisoning inference.
        Update: Record<string, never>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          user_id: string | null;
          action: string;
          item_id: string | null;
          metadata: Record<string, unknown>;
          ip_hash: string | null;
          created_at: string;
        };
        // service_role-only writes — no client Insert/Update.
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_emergency_vault_key: {
        Args: { access_id: string };
        Returns: WrappedPayloadRow;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
