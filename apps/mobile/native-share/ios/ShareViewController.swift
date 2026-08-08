import Social
import UniformTypeIdentifiers

final class ShareViewController: SLComposeServiceViewController {
    private let appGroup = "group.app.needthislater.mobile"

    override func isContentValid() -> Bool { true }

    override func didSelectPost() {
        let providers = extensionContext?.inputItems
            .compactMap { $0 as? NSExtensionItem }
            .flatMap(\.attachments!) ?? []
        let group = DispatchGroup()
        var payloads: [[String: String]] = []

        for provider in providers {
            for type in [UTType.url.identifier, UTType.plainText.identifier, UTType.image.identifier, UTType.data.identifier] where provider.hasItemConformingToTypeIdentifier(type) {
                group.enter()
                provider.loadItem(forTypeIdentifier: type, options: nil) { item, _ in
                    defer { group.leave() }
                    if let url = item as? URL { payloads.append(["type": type, "value": url.absoluteString]) }
                    else if let text = item as? String { payloads.append(["type": type, "value": text]) }
                }
                break
            }
        }

        group.notify(queue: .main) {
            let defaults = UserDefaults(suiteName: self.appGroup)
            defaults?.set(try? JSONSerialization.data(withJSONObject: payloads), forKey: "pending-share")
            self.extensionContext?.completeRequest(returningItems: nil)
        }
    }

    override func configurationItems() -> [Any]! { [] }
}
