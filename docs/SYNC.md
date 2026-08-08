# Sync protocol

## Remote records

`encrypted_items` exposes only routing and reconciliation fields: `id`, `user_id`, `revision`, `updated_at`, `device_id`, `deleted`, and encrypted JSON `payload`. The primary key makes retrying an upsert idempotent. `vault_headers` stores one wrapped-key header per authenticated user. Encrypted attachment objects use `<user>/<item>/<attachment>.ntl` in a private bucket.

## Cycle

1. Read ordered local outbox operations.
2. Load and decrypt the current local item revision.
3. Encrypt every referenced attachment and upload it first.
4. Encrypt the item using its ID and revision as authenticated context.
5. Upsert the encrypted row.
6. Remove acknowledged outbox operations only after the server accepts the batch.
7. Pull rows at or after the last timestamp cursor.
8. Authenticate, decrypt, validate, and compare revisions.
9. Download and authenticate missing attachment objects before committing an incoming item.

The inclusive cursor deliberately permits duplicate delivery; item ID/revision processing is idempotent.

## Conflicts

- Remote revision greater than local: apply remote.
- Local revision greater than remote: retain local; its outbox revision will upload.
- Same revision and content: no-op.
- Same revision, different device, different authenticated content: preserve the local item and save the remote content under a new UUIDv7 with `(conflict copy)` in the title.

No change is silently discarded. This is item-level last-revision reconciliation, not a CRDT.

## Deletes and logout

Delete is a revision with `deletedAt` plus an unencrypted routing tombstone flag. Trash restore creates another higher revision. Tombstones are retained so an offline device cannot resurrect a stale row. Lock/disconnect clears the in-memory vault key but leaves the local database untouched.

## Failure behavior

Network and authorization errors reject the sync cycle without deleting local content. Attachment upload precedes row upload to avoid publishing a row that references a missing object. Re-uploading an encrypted object is safe; each upload may use new ciphertext for the same authenticated plaintext.
