import AuthenticationServices
import SwiftUI

/// NSExtensionPrincipalClass target (Info.plist) — the system instantiates
/// this when the user picks "Password Manager" from the AutoFill passwords
/// sheet (build plan §7 step 7). Login-item autofill only for now
/// (ASCredentialProviderExtensionCapabilities in Info.plist declares just
/// ProvidesPasswords), matching every other surface's login-first MVP scope.
class CredentialProviderViewController: ASCredentialProviderViewController {
    override func prepareCredentialList(for serviceIdentifiers: [ASCredentialServiceIdentifier]) {
        presentList(for: serviceIdentifiers)
    }

    @available(iOS 17.0, *)
    override func prepareCredentialList(
        for serviceIdentifiers: [ASCredentialServiceIdentifier],
        requestParameters: ASPasswordCredentialRequestParameters
    ) {
        presentList(for: serviceIdentifiers)
    }

    private func presentList(for serviceIdentifiers: [ASCredentialServiceIdentifier]) {
        let hosting = UIHostingController(
            rootView: CredentialListView(
                serviceIdentifiers: serviceIdentifiers,
                onSelect: { [weak self] item in self?.complete(with: item) },
                onCancel: { [weak self] in self?.cancel() }
            )
        )
        addChild(hosting)
        hosting.view.frame = view.bounds
        hosting.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(hosting.view)
        hosting.didMove(toParent: self)
    }

    private func complete(with item: LoginItem) {
        let credential = ASPasswordCredential(user: item.username ?? "", password: item.password)
        extensionContext.completeRequest(withSelectedCredential: credential, completionHandler: nil)
    }

    private func cancel() {
        extensionContext.cancelRequest(
            withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.userCanceled.rawValue)
        )
    }
}
