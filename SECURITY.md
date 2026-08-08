# Security policy

## Supported versions

Security fixes are provided for the latest `1.x` release. The project is pre-audit software: its dependencies include audited primitives, but the complete application has not received an independent professional security audit.

## Report a vulnerability

Do not open a public issue for a vulnerability. Use GitHub’s private vulnerability reporting feature for the repository. Include the affected version, reproduction steps, impact, and any suggested mitigation. Maintainers should acknowledge a complete report within seven days and coordinate disclosure after a fix is available.

Never include real recovery keys, account passwords, tokens, user exports, or decrypted inbox data in a report.

## Security design

Local records use AES-256-GCM through Web Crypto with a non-exportable `CryptoKey` stored in IndexedDB. Each record and attachment receives a fresh random 96-bit nonce and authenticated context string. This is automatic device encryption, not a user-unlock boundary: code running in the same app origin can ask the browser to use that key.

Sync vaults use:

- random 256-bit master vault keys;
- Argon2id password derivation (`m=19,456 KiB`, `t=2`, `p=1`, 32-byte output, random 128-bit salt);
- XChaCha20-Poly1305 authenticated encryption with random 192-bit nonces;
- a separate random 256-bit recovery secret, HKDF-SHA-256 recovery wrapping key, and locally displayed `NTL1-` recovery key;
- authenticated purpose strings that bind ciphertext to its format and record identity.

Account authentication and vault encryption are separate. Supabase receives a wrapped master key, never the plaintext master key or recovery key. Attachment filenames and MIME metadata live inside encrypted items. Uploaded objects contain a version marker, nonce, and ciphertext.

The implementation uses `@noble/ciphers` and `@noble/hashes`; it does not implement ChaCha, Poly1305, Argon2, HKDF, SHA-256, AES, or random generation itself. A stable compatibility vector is tested in `tests/crypto.test.ts`.

## Server-visible metadata

The server can see user UUID, opaque item UUID, revision, update timestamp, opaque device ID, tombstone flag, encrypted payload size, attachment object identifiers/sizes, IP address, authentication records, request timing, and operational logs. Search terms and plaintext indexes are not uploaded.

Because this metadata is visible, the project avoids an absolute “zero knowledge” claim.

## Threat coverage

The design aims to limit damage from a stolen Supabase database or storage bucket, cross-account queries, replayed/duplicated sync requests, offline conflicts, corrupted ciphertext, malicious filenames, stored script strings, oversized attachments, and accidental secret commits.

RLS restricts rows to `auth.uid()`. Storage policies require the first object-path segment to equal `auth.uid()`. Client builds use only the public anonymous key; the service-role key is never required. Item rendering uses React text nodes and never captured HTML injection.

## Known limitations

- A compromised OS, browser, extension with page access, or application origin can read data while the user is using it.
- Local Mode has no password prompt. Its non-exportable device key primarily protects raw storage snapshots, not active same-origin script compromise.
- Password strength remains user-dependent. The Argon2id parameters balance mobile/browser responsiveness and resistance and may be raised in a versioned header later.
- Attachments are capped at 25 MiB and are buffered for encryption in this release.
- Auth access tokens are bearer credentials. The web interface keeps active sync material in memory; the extension uses session storage. Lock or close the application on shared devices.
- Deleting a remote ciphertext does not prove immediate physical erasure from provider backups.
- Unsigned Windows and macOS desktop releases do not provide operating-system publisher identity.

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for detailed boundaries and mitigations.
