# Encryption formats

## Local Mode

The browser generates a 256-bit AES-GCM `CryptoKey` with `extractable=false` and stores the structured-cloned key in IndexedDB. Item JSON and attachment bytes use fresh 96-bit nonces. Additional authenticated data is `item:<uuid>` or `attachment:<uuid>`. IndexedDB stores only `{id, updatedAt, iv, ciphertext}` for an item.

This makes raw record values unreadable without the device key. It does not provide a password lock and cannot stop malicious same-origin code from invoking Web Crypto with the stored key.

## Sync vault header

```json
{
  "version": 1,
  "kdf": {
    "algorithm": "Argon2id",
    "memoryKiB": 19456,
    "iterations": 2,
    "parallelism": 1,
    "outputBytes": 32
  },
  "salt": "base64url",
  "wrappedMasterKey": { "version": 1, "algorithm": "XChaCha20-Poly1305", "nonce": "base64url", "ciphertext": "base64url" },
  "recoverySalt": "base64url",
  "recoveryWrappedMasterKey": { "version": 1, "algorithm": "XChaCha20-Poly1305", "nonce": "base64url", "ciphertext": "base64url" }
}
```

The master key is 32 random bytes. The vault password derives the first wrapping key. The recovery key encodes 32 independently random bytes; HKDF-SHA-256 plus `recoverySalt` derives the recovery wrapping key. Password changes re-wrap the same master key rather than re-encrypting every item.

## Record envelopes

JSON envelopes contain version, algorithm, 24-byte nonce, and ciphertext encoded as unpadded base64url. Additional authenticated data begins `need-this-later:v1:` and includes a purpose such as `sync-item:<uuid>:revision:<n>`. A row whose public ID, revision, or timestamp disagrees with decrypted authenticated content is rejected.

Attachment objects are binary:

```text
4e 54 4c 41 | 01 | 24-byte nonce | XChaCha20-Poly1305 ciphertext + 16-byte tag
   NTLA      version
```

Original filename, MIME type, and note remain inside the encrypted Item payload.

## Backup format

An encrypted backup is JSON containing format/version, Argon2id parameters, salt, and one XChaCha20-Poly1305 envelope. The envelope contains the portable payload: every validated Item plus attachment bytes encoded as base64url. Restore validates the whole payload, clears the current vault, writes attachments and items, and clears again if any write fails.

## Compatibility vector

`tests/crypto.test.ts` fixes a 32-byte key, 24-byte nonce, purpose, and UTF-8 message containing English, Arabic, and emoji. All platform implementations must reproduce the committed ciphertext before claiming compatibility.
