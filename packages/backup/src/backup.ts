import { z } from "zod";
import { itemSchema, type AttachmentRef, type Item } from "../../core/src/model";
import { MAX_ATTACHMENT_BYTES, clearVault, readAttachment, saveItem, storeAttachmentBytes } from "../../database/src/indexeddb";
import {
  DEFAULT_KDF,
  base64UrlToBytes,
  bytesToBase64Url,
  decryptJson,
  derivePasswordKey,
  encryptJson,
  type CipherEnvelope,
} from "../../crypto/src/vault";

const attachmentBackupSchema = z.object({
  ref: z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(255),
    mimeType: z.string().max(200),
    size: z.number().int().nonnegative().max(MAX_ATTACHMENT_BYTES),
  }),
  data: z.string(),
});

const payloadSchema = z.object({
  format: z.literal("need-this-later-portable"),
  version: z.literal(1),
  createdAt: z.string().datetime(),
  items: z.array(itemSchema),
  attachments: z.array(attachmentBackupSchema),
});

const encryptedBackupSchema = z.object({
  format: z.literal("need-this-later-encrypted-backup"),
  version: z.literal(1),
  createdAt: z.string().datetime(),
  kdf: z.object({
    algorithm: z.literal("Argon2id"),
    memoryKiB: z.number().int(),
    iterations: z.number().int(),
    parallelism: z.number().int(),
    outputBytes: z.number().int(),
  }),
  salt: z.string(),
  payload: z.object({
    version: z.literal(1),
    algorithm: z.literal("XChaCha20-Poly1305"),
    nonce: z.string(),
    ciphertext: z.string(),
  }),
});

export type PortableBackup = z.infer<typeof payloadSchema>;

async function collectAttachments(database: IDBDatabase, items: Item[]) {
  const references = new Map<string, AttachmentRef>();
  items.forEach((item) => item.attachments.forEach((attachment) => references.set(attachment.id, attachment)));
  return Promise.all([...references.values()].map(async (ref) => {
    const bytes = new Uint8Array(await (await readAttachment(database, ref)).arrayBuffer());
    try {
      return { ref, data: bytesToBase64Url(bytes) };
    } finally {
      bytes.fill(0);
    }
  }));
}

export async function createPortableExport(database: IDBDatabase, items: Item[]): Promise<string> {
  const payload: PortableBackup = {
    format: "need-this-later-portable",
    version: 1,
    createdAt: new Date().toISOString(),
    items,
    attachments: await collectAttachments(database, items),
  };
  return JSON.stringify(payload, null, 2);
}

export async function createEncryptedBackup(database: IDBDatabase, items: Item[], password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await derivePasswordKey(password, salt);
  try {
    const portable = payloadSchema.parse(JSON.parse(await createPortableExport(database, items)));
    return JSON.stringify({
      format: "need-this-later-encrypted-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      kdf: DEFAULT_KDF,
      salt: bytesToBase64Url(salt),
      payload: encryptJson(portable, key, "encrypted-backup-v1"),
    }, null, 2);
  } finally {
    key.fill(0);
  }
}

export async function readEncryptedBackup(serialized: string, password: string): Promise<PortableBackup> {
  const backup = encryptedBackupSchema.parse(JSON.parse(serialized));
  const key = await derivePasswordKey(password, base64UrlToBytes(backup.salt), backup.kdf);
  try {
    return payloadSchema.parse(decryptJson(backup.payload as CipherEnvelope, key, "encrypted-backup-v1"));
  } catch (error) {
    if (error instanceof z.ZodError) throw new Error("The backup contains invalid data");
    throw new Error("The backup password is incorrect or the file is damaged");
  } finally {
    key.fill(0);
  }
}

export function readPortableExport(serialized: string): PortableBackup {
  try {
    return payloadSchema.parse(JSON.parse(serialized));
  } catch {
    throw new Error("This is not a valid I Need This Later portable export");
  }
}

export async function restoreBackup(database: IDBDatabase, payload: PortableBackup): Promise<void> {
  const validated = payloadSchema.parse(payload);
  await clearVault(database);
  try {
    for (const attachment of validated.attachments) {
      const bytes = base64UrlToBytes(attachment.data);
      try {
        await storeAttachmentBytes(database, attachment.ref, bytes);
      } finally {
        bytes.fill(0);
      }
    }
    for (const item of validated.items) await saveItem(database, item, false);
  } catch (error) {
    await clearVault(database);
    throw error;
  }
}
