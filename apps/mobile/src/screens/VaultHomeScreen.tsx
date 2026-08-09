import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import type { Database } from "@password-manager/api-client";
import type { VaultItemContent } from "@password-manager/core-domain";

export interface DecryptedItem {
  row: Database["public"]["Tables"]["vault_items"]["Row"];
  content: VaultItemContent;
}

export interface VaultHomeScreenProps {
  items: DecryptedItem[];
  loading: boolean;
  onSelectItem: (itemId: string) => void;
  onAddItem: () => void;
}

// Small custom glyph set for item types — design plan §2 Iconography reserves
// custom icons specifically for concepts the OS icon set doesn't have.
const TYPE_GLYPH: Record<string, string> = { login: "🔑", note: "📝", card: "💳", identity: "🪪" };

/** Search pinned at top (never scrolls away), favicon-style initial circle +
 * title/username row, FAB for add — mobile design plan §4.3. */
export function VaultHomeScreen({ items, loading, onSelectItem, onAddItem }: VaultHomeScreenProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.content.title.toLowerCase().includes(q) ||
        ("username" in item.content && item.content.username?.toLowerCase().includes(q)),
    );
  }, [items, query]);

  return (
    <View className="flex-1 bg-base px-5 pt-14">
      <Text className="mb-4 text-lg font-semibold text-white">Vault</Text>
      <TextInput
        placeholder="Search"
        placeholderTextColor="#ffffff59"
        value={query}
        onChangeText={setQuery}
        className="mb-4 rounded-xl border border-white/10 bg-surface px-4 py-3 text-white"
      />

      {loading ? (
        <Text className="text-sm text-white/60">Loading…</Text>
      ) : filtered.length === 0 ? (
        <View className="items-center gap-3 py-16">
          <Text className="text-3xl">🔑</Text>
          <Text className="text-md font-semibold text-white">
            {items.length === 0 ? "Add your first password" : "No matches"}
          </Text>
          <Text className="max-w-xs text-center text-sm text-white/60">
            {items.length === 0
              ? "Everything you save is encrypted on this device before it's sent anywhere."
              : "Try a different search."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.row.id}
          ItemSeparatorComponent={() => <View className="h-px bg-white/[0.06]" />}
          renderItem={({ item }) => (
            <Pressable onPress={() => onSelectItem(item.row.id)} className="flex-row items-center gap-3 py-4">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                <Text className="font-semibold text-accent">{item.content.title.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-white" numberOfLines={1}>
                  {item.content.title}
                </Text>
                {"username" in item.content && item.content.username && (
                  <Text className="text-xs text-white/60" numberOfLines={1}>
                    {item.content.username}
                  </Text>
                )}
              </View>
              <Text className="text-base">{TYPE_GLYPH[item.row.type] ?? "🔒"}</Text>
            </Pressable>
          )}
        />
      )}

      <Pressable
        onPress={onAddItem}
        className="absolute bottom-8 right-8 h-14 w-14 items-center justify-center rounded-full bg-accent shadow-lg"
      >
        <Text className="text-2xl text-white">+</Text>
      </Pressable>
    </View>
  );
}
