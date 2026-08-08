import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "@noble/ciphers/webcrypto.js";
import { argon2idAsync } from "@noble/hashes/argon2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha256.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

export const CRYPTO_VERSION = 1;
export const XCHACHA_ALGORITHM = "XChaCha20-Poly1305" as const;
export const DEFAULT_KDF = { algorithm: "Argon2id" as const, memoryKiB: 19_456, iterations: 2, parallelism: 1, outputBytes: 32 };

export interface CipherEnvelope {
  version: 1;
  algorithm: typeof XCHACHA_ALGORITHM;
  nonce: string;
  ciphertext: string;
}

export interface VaultHeader {
  version: 1;
  kdf: typeof DEFAULT_KDF;
  salt: string;
  wrappedMasterKey: CipherEnvelope;
  recoverySalt: string;
  recoveryWrappedMasterKey: CipherEnvelope;
}

export interface CreatedVault {
  header: VaultHeader;
  masterKey: Uint8Array;
  recoveryKey: string;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function aad(purpose: string): Uint8Array {
  return textEncoder.encode(`need-this-later:v${CRYPTO_VERSION}:${purpose}`);
}

export function encryptBytes(plaintext: Uint8Array, key: Uint8Array, purpose: string, nonce = randomBytes(24)): CipherEnvelope {
  if (key.length !== 32) throw new Error("Encryption keys must be 32 bytes");
  if (nonce.length !== 24) throw new Error("XChaCha20-Poly1305 nonces must be 24 bytes");
  const ciphertext = xchacha20poly1305(key, nonce, aad(purpose)).encrypt(plaintext);
  return {
    version: CRYPTO_VERSION,
    algorithm: XCHACHA_ALGORITHM,
    nonce: bytesToBase64Url(nonce),
    ciphertext: bytesToBase64Url(ciphertext),
  };
}

export function decryptBytes(envelope: CipherEnvelope, key: Uint8Array, purpose: string): Uint8Array {
  if (envelope.version !== CRYPTO_VERSION || envelope.algorithm !== XCHACHA_ALGORITHM) {
    throw new Error("Unsupported encrypted payload version");
  }
  try {
    return xchacha20poly1305(key, base64UrlToBytes(envelope.nonce), aad(purpose))
      .decrypt(base64UrlToBytes(envelope.ciphertext));
  } catch {
    throw new Error("Encrypted data could not be authenticated");
  }
}

const ATTACHMENT_MAGIC = new Uint8Array([0x4e, 0x54, 0x4c, 0x41, CRYPTO_VERSION]);

export function packCipherEnvelope(envelope: CipherEnvelope): Uint8Array {
  const nonce = base64UrlToBytes(envelope.nonce);
  const ciphertext = base64UrlToBytes(envelope.ciphertext);
  const packed = new Uint8Array(ATTACHMENT_MAGIC.length + nonce.length + ciphertext.length);
  packed.set(ATTACHMENT_MAGIC);
  packed.set(nonce, ATTACHMENT_MAGIC.length);
  packed.set(ciphertext, ATTACHMENT_MAGIC.length + nonce.length);
  return packed;
}

export function unpackCipherEnvelope(packed: Uint8Array): CipherEnvelope {
  if (packed.length < ATTACHMENT_MAGIC.length + 24 + 16 || !ATTACHMENT_MAGIC.every((byte, index) => packed[index] === byte)) {
    throw new Error("Unsupported encrypted attachment format");
  }
  return {
    version: CRYPTO_VERSION,
    algorithm: XCHACHA_ALGORITHM,
    nonce: bytesToBase64Url(packed.slice(ATTACHMENT_MAGIC.length, ATTACHMENT_MAGIC.length + 24)),
    ciphertext: bytesToBase64Url(packed.slice(ATTACHMENT_MAGIC.length + 24)),
  };
}

export function encryptJson(value: unknown, key: Uint8Array, purpose: string, nonce?: Uint8Array): CipherEnvelope {
  return encryptBytes(textEncoder.encode(JSON.stringify(value)), key, purpose, nonce);
}

export function decryptJson<T>(envelope: CipherEnvelope, key: Uint8Array, purpose: string): T {
  const plaintext = decryptBytes(envelope, key, purpose);
  try {
    return JSON.parse(textDecoder.decode(plaintext)) as T;
  } finally {
    plaintext.fill(0);
  }
}

export async function derivePasswordKey(password: string, salt: Uint8Array, kdf = DEFAULT_KDF): Promise<Uint8Array> {
  if (password.length < 10) throw new Error("Vault passwords must contain at least 10 characters");
  return argon2idAsync(password, salt, {
    t: kdf.iterations,
    m: kdf.memoryKiB,
    p: kdf.parallelism,
    dkLen: kdf.outputBytes,
    asyncTick: 10,
  });
}

function deriveRecoveryKey(recoveryKey: Uint8Array, salt: Uint8Array): Uint8Array {
  return hkdf(sha256, recoveryKey, salt, aad("recovery-key-wrap"), 32);
}

export async function createVault(password: string): Promise<CreatedVault> {
  const masterKey = randomBytes(32);
  const salt = randomBytes(16);
  const recoverySalt = randomBytes(16);
  const recoverySecret = randomBytes(32);
  const passwordKey = await derivePasswordKey(password, salt);
  const recoveryWrappingKey = deriveRecoveryKey(recoverySecret, recoverySalt);
  try {
    return {
      masterKey,
      recoveryKey: `NTL1-${bytesToBase64Url(recoverySecret)}`,
      header: {
        version: CRYPTO_VERSION,
        kdf: DEFAULT_KDF,
        salt: bytesToBase64Url(salt),
        wrappedMasterKey: encryptBytes(masterKey, passwordKey, "master-key-wrap"),
        recoverySalt: bytesToBase64Url(recoverySalt),
        recoveryWrappedMasterKey: encryptBytes(masterKey, recoveryWrappingKey, "recovery-master-key-wrap"),
      },
    };
  } finally {
    passwordKey.fill(0);
    recoveryWrappingKey.fill(0);
    recoverySecret.fill(0);
  }
}

export async function unlockVault(password: string, header: VaultHeader): Promise<Uint8Array> {
  const passwordKey = await derivePasswordKey(password, base64UrlToBytes(header.salt), header.kdf);
  try {
    return decryptBytes(header.wrappedMasterKey, passwordKey, "master-key-wrap");
  } catch {
    throw new Error("The vault password is incorrect or the vault header is damaged");
  } finally {
    passwordKey.fill(0);
  }
}

export function recoverVault(recoveryKey: string, header: VaultHeader): Uint8Array {
  if (!recoveryKey.startsWith("NTL1-")) throw new Error("This recovery key is not recognized");
  const secret = base64UrlToBytes(recoveryKey.slice(5));
  const wrappingKey = deriveRecoveryKey(secret, base64UrlToBytes(header.recoverySalt));
  try {
    return decryptBytes(header.recoveryWrappedMasterKey, wrappingKey, "recovery-master-key-wrap");
  } catch {
    throw new Error("The recovery key is incorrect or the vault header is damaged");
  } finally {
    secret.fill(0);
    wrappingKey.fill(0);
  }
}

export async function rewrapVault(masterKey: Uint8Array, newPassword: string, currentHeader: VaultHeader): Promise<VaultHeader> {
  const salt = randomBytes(16);
  const passwordKey = await derivePasswordKey(newPassword, salt);
  try {
    return {
      ...currentHeader,
      salt: bytesToBase64Url(salt),
      kdf: DEFAULT_KDF,
      wrappedMasterKey: encryptBytes(masterKey, passwordKey, "master-key-wrap"),
    };
  } finally {
    passwordKey.fill(0);
  }
}

export const compatibilityVector = {
  key: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
  nonce: "ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3",
  purpose: "compatibility-test",
  plaintext: "I need this later — أحتاج هذا لاحقًا 🔐",
};

export function createCompatibilityVectorCiphertext(): string {
  return encryptBytes(
    textEncoder.encode(compatibilityVector.plaintext),
    base64UrlToBytes(compatibilityVector.key),
    compatibilityVector.purpose,
    base64UrlToBytes(compatibilityVector.nonce),
  ).ciphertext;
}
