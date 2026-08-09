import AuthenticationServices
import SwiftUI

/// Mirrors just the fields of core-domain's LoginContent that autofill
/// needs — decoded from the plaintext JSON VaultCrypto.decryptItem returns.
/// Extra unknown keys (totp, notes, kind) are ignored, not an error.
struct LoginItem: Decodable {
    let title: String
    let username: String?
    let password: String
    let urls: [String]
}

enum CredentialListState {
    case loading
    case needsUnlock // Keychain read failed — biometric cancel/fail, or no cache saved yet on this device
    case loaded([LoginItem])
    case error(String)
}

/// The extension's entire UI — mobile design plan §4/§7's "own minimal UI
/// (search + biometric unlock), not the main app UI". Biometric unlock
/// itself isn't a screen here: it's the system Face ID sheet the OS shows
/// automatically when SharedVaultStore reads the BIOMETRY_CURRENT_SET
/// Keychain item, before this view has anything to render.
struct CredentialListView: View {
    let serviceIdentifiers: [ASCredentialServiceIdentifier]
    let onSelect: (LoginItem) -> Void
    let onCancel: () -> Void

    @State private var state: CredentialListState = .loading
    @State private var query: String = ""

    var body: some View {
        NavigationView {
            content
                .navigationTitle("Vault")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel", action: onCancel)
                    }
                }
        }
        .task { await load() }
    }

    @ViewBuilder
    private var content: some View {
        switch state {
        case .loading:
            ProgressView()
        case .needsUnlock:
            VStack(spacing: 12) {
                Text("Couldn't unlock the vault").font(.headline)
                Text("Open Password Manager and unlock it at least once on this device first.")
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                Button("Try again") { Task { await load() } }
            }
            .padding()
        case .error(let message):
            Text(message).foregroundColor(.secondary).padding()
        case .loaded(let items):
            let filtered = filter(items)
            List {
                if filtered.isEmpty {
                    Text(items.isEmpty ? "No saved logins yet." : "No matches.")
                        .foregroundColor(.secondary)
                } else {
                    ForEach(Array(filtered.enumerated()), id: \.offset) { _, item in
                        Button {
                            onSelect(item)
                        } label: {
                            VStack(alignment: .leading) {
                                Text(item.title).font(.body)
                                if let username = item.username, !username.isEmpty {
                                    Text(username).font(.footnote).foregroundColor(.secondary)
                                }
                            }
                        }
                    }
                }
            }
            .searchable(text: $query, prompt: "Search vault")
        }
    }

    private func filter(_ items: [LoginItem]) -> [LoginItem] {
        let requestedHosts = Set(serviceIdentifiers.map { hostOf($0.identifier) })
        var candidates = items
        if !requestedHosts.isEmpty {
            let domainMatches = items.filter { item in
                item.urls.contains { url in requestedHosts.contains(hostOf(url)) }
            }
            // Domain match narrows the list when we have one; an empty match
            // falls back to the full list rather than showing nothing (the
            // requesting app's identifier and the saved URL don't always
            // line up exactly — better to let the user search than dead-end).
            if !domainMatches.isEmpty { candidates = domainMatches }
        }
        guard !query.isEmpty else { return candidates }
        let q = query.lowercased()
        return candidates.filter {
            $0.title.lowercased().contains(q) || ($0.username?.lowercased().contains(q) ?? false)
        }
    }

    private func hostOf(_ raw: String) -> String {
        if let url = URL(string: raw), let host = url.host { return host.lowercased() }
        return raw.lowercased()
    }

    private func load() async {
        do {
            let vmkBase64 = try SharedVaultStore.readVmkBase64()
            let vmk = try VaultCrypto.fromBase64(vmkBase64)
            let cached = try SharedVaultStore.readCachedItems()

            let decoder = JSONDecoder()
            let items: [LoginItem] = cached.compactMap { row in
                guard row.type == "login" else { return nil }
                do {
                    let itemKey = try VaultCrypto.unwrapKey(
                        nonce: row.wrappedItemKey.nonce,
                        ciphertext: row.wrappedItemKey.ciphertext,
                        wrappingKey: vmk
                    )
                    let plaintext = try VaultCrypto.decryptItem(
                        nonce: row.content.nonce,
                        ciphertext: row.content.ciphertext,
                        aad: row.content.aad,
                        itemKey: itemKey
                    )
                    return try decoder.decode(LoginItem.self, from: Data(plaintext.utf8))
                } catch {
                    return nil // one bad row shouldn't blank the whole list
                }
            }
            state = .loaded(items)
        } catch is SharedVaultStoreError {
            state = .needsUnlock
        } catch {
            state = .error("Something went wrong reading your vault.")
        }
    }
}
