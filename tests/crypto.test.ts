import { describe, expect, it } from "vitest";
import {
  base64UrlToBytes,
  compatibilityVector,
  createCompatibilityVectorCiphertext,
  createVault,
  decryptJson,
  encryptJson,
  recoverVault,
  unlockVault,
} from "../packages/crypto/src/vault";

describe("vault cryptography", () => {
  it("wraps a random master key with a password and recovery key", async () => {
    const created = await createVault("correct horse battery staple");
    const unlocked = await unlockVault("correct horse battery staple", created.header);
    const recovered = recoverVault(created.recoveryKey, created.header);
    expect(unlocked).toEqual(created.masterKey);
    expect(recovered).toEqual(created.masterKey);
    expect(created.recoveryKey).toMatch(/^NTL1-/);
  });

  it("rejects the wrong password and corrupted authenticated ciphertext", async () => {
    const created = await createVault("correct horse battery staple");
    await expect(unlockVault("this password is wrong", created.header)).rejects.toThrow(/incorrect|damaged/);
    const envelope = encryptJson({ secret: "never plaintext remotely" }, created.masterKey, "record:test");
    const corrupted = { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -2)}AA` };
    expect(() => decryptJson(corrupted, created.masterKey, "record:test")).toThrow(/authenticated/);
  });

  it("uses a stable cross-platform XChaCha20-Poly1305 vector", () => {
    expect(base64UrlToBytes(compatibilityVector.key)).toHaveLength(32);
    expect(createCompatibilityVectorCiphertext()).toBe("VHkjrh5TNP9Q1yOdJCZ1tE91M7xLs94WOcyEg9eeMq4RmKeacTuBLosg7ellPO-GsFh1bMw3YkBAnfjj81SFV572LUOtQtnxFw");
  });
});
