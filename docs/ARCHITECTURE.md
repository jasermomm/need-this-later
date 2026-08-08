# Architecture

## Principles

1. A save is a local transaction and never waits for the network.
2. The capture route is the default route on every surface.
3. Plaintext content is decrypted only on the client that needs it.
4. Search scans decrypted local records; no search index crosses the sync boundary.
5. Item-level revisions and conflict copies are preferred to a CRDT for the first release.

## Components

`packages/core` owns the versioned Item schema, UUIDv7 generation, tag normalization, link detection, and revision updates. `packages/database` encrypts items and attachments before IndexedDB writes and maintains an outbox. `packages/search` performs local matching and filtering. `packages/crypto` owns vault wrapping and cross-platform ciphertext formats. `packages/sync` reconciles encrypted rows and attachment objects through a transport interface. `packages/backup` owns portable and encrypted backup formats.

The React interface in `app/IneedthislaterApp.tsx` is used by both the Vinext/Sites build and the static Vite PWA build. Tauri and Capacitor consume the static build. The WebExtension uses the same item and remote ciphertext formats but has its own extension-local queue because extension origins cannot share IndexedDB with a website.

## Data flow

### Local save

```text
composer → validate Item → encrypt with device CryptoKey → IndexedDB items
                                           └────────────→ IndexedDB outbox
```

Attachments are encrypted into a separate object store. The item keeps an authenticated reference containing ID, user-facing name, MIME type, and size.

### Sync

```text
outbox → decrypt local record → encrypt with vault key → authenticated Supabase row
file store → decrypt local bytes → encrypt with vault key → private Storage object
```

The local database remains authoritative for responsiveness. A failed upload leaves the outbox intact. An incoming higher revision replaces a local lower revision. Same-revision, different-device content creates a new conflict-copy item.

## Schema evolution

Items carry `schemaVersion`; backups and cipher envelopes carry independent versions. IndexedDB has a numeric database version and creates stores only during the upgrade transaction. Remote migrations are append-only SQL files. A format change must keep a reader for older supported versions or provide an explicit migration.

## Performance

Capture performs validation plus one local authenticated-encryption write. Sync runs afterward. Search is an in-memory linear scan over decrypted items; this is intentionally simple for the first release and is responsive for ordinary personal inbox sizes. A future large-vault index must remain encrypted and device-local.
