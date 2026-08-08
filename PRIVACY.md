# Privacy

Effective: 2026-08-08

I Need This Later is designed to work without an account and without sending user content anywhere.

## Local Mode

Local Mode stores items, files, preferences, and an encryption key in the application’s device-local browser storage. No account is created. The project includes no advertising, telemetry, analytics, fingerprinting, crash-reporting SDK, or background clipboard monitoring.

Removing site/app data or uninstalling without a backup can permanently remove the local inbox.

## Sync Mode

Sync is explicitly enabled by the user. The client sends authentication data directly to the configured Supabase Auth service. Saved content, titles, URLs, tags, filenames, notes, and attachment bytes are encrypted on the device before upload.

The sync server can observe:

- account ID and authentication data handled by Supabase Auth;
- opaque item and device IDs;
- revision number, update time, and tombstone state;
- encrypted object paths, ciphertext sizes, request times, IP address, and normal service logs.

The sync server should not receive readable item content, URLs, tags, filenames, or search indexes. Search remains on-device.

## Browser extension

Without sync unlock, the extension keeps a separate encrypted capture queue in extension-local storage. Its key is stored beside the ciphertext, which protects against casual plaintext inspection but not a compromised browser profile. Unlocking sync keeps the vault key and access token in extension session storage and sends new captures as authenticated ciphertext.

## Exports

Plaintext export is intentionally readable and includes attachments. The app warns before creating it. Encrypted backups use a user-chosen password that the project cannot recover.

## Permissions

The PWA requests notification permission only in response to a reminder action. The extension uses `activeTab`, `scripting`, `contextMenus`, and `storage`; it has no broad host permission. The application does not request location, contacts, microphone, or camera access.

Self-hosters are responsible for their own privacy notice, retention policy, and Supabase operational logs.
