import { itemSchema, type AttachmentRef, type Item, uuidV7 } from "../../core/src/model";

const DATABASE_NAME = "need-this-later";
const DATABASE_VERSION = 3;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

interface StoredCiphertext {
  id: string;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
  updatedAt: string;
}

interface StoredAttachment extends StoredCiphertext {
  size: number;
}

export interface OutboxOperation {
  id: string;
  itemId: string;
  revision: number;
  updatedAt: string;
  operation: "upsert" | "delete";
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), { once: true });
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")), { once: true });
  });
}

export function openLocalDatabase(name = DATABASE_NAME): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB is not available in this environment");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("meta")) database.createObjectStore("meta");
      if (!database.objectStoreNames.contains("items")) database.createObjectStore("items", { keyPath: "id" });
      if (!database.objectStoreNames.contains("attachments")) database.createObjectStore("attachments", { keyPath: "id" });
      if (!database.objectStoreNames.contains("outbox")) database.createObjectStore("outbox", { keyPath: "id" });
    });
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("Could not open the local inbox")), { once: true });
    request.addEventListener("blocked", () => reject(new Error("Close other open copies of the app to finish the database upgrade")), { once: true });
  });
}

async function getOrCreateDeviceKey(database: IDBDatabase): Promise<CryptoKey> {
  const read = database.transaction("meta", "readonly");
  const existing = await requestResult(read.objectStore("meta").get("device-key") as IDBRequest<CryptoKey | undefined>);
  await transactionDone(read);
  if (existing) return existing;

  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const write = database.transaction("meta", "readwrite");
  write.objectStore("meta").put(key, "device-key");
  await transactionDone(write);
  return key;
}

export async function getDeviceId(database: IDBDatabase): Promise<string> {
  const read = database.transaction("meta", "readonly");
  const existing = await requestResult(read.objectStore("meta").get("device-id") as IDBRequest<string | undefined>);
  await transactionDone(read);
  if (existing) return existing;
  const deviceId = uuidV7();
  const write = database.transaction("meta", "readwrite");
  write.objectStore("meta").put(deviceId, "device-id");
  await transactionDone(write);
  return deviceId;
}

async function encryptLocal(database: IDBDatabase, plaintext: Uint8Array, context: string): Promise<{ iv: ArrayBuffer; ciphertext: ArrayBuffer }> {
  const key = await getOrCreateDeviceKey(database);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: Uint8Array.from(new TextEncoder().encode(context)), tagLength: 128 },
    key,
    Uint8Array.from(plaintext),
  );
  return { iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength), ciphertext };
}

async function decryptLocal(database: IDBDatabase, record: StoredCiphertext, context: string): Promise<Uint8Array> {
  const key = await getOrCreateDeviceKey(database);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(record.iv), additionalData: Uint8Array.from(new TextEncoder().encode(context)), tagLength: 128 },
      key,
      record.ciphertext,
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new Error("A local encrypted record failed authentication");
  }
}

export async function saveItem(database: IDBDatabase, item: Item, queueForSync = true): Promise<void> {
  const validated = itemSchema.parse(item);
  const encrypted = await encryptLocal(database, new TextEncoder().encode(JSON.stringify(validated)), `item:${validated.id}`);
  const transaction = database.transaction(queueForSync ? ["items", "outbox"] : ["items"], "readwrite");
  transaction.objectStore("items").put({ id: validated.id, updatedAt: validated.updatedAt, ...encrypted } satisfies StoredCiphertext);
  if (queueForSync) {
    const operation: OutboxOperation = {
      id: `${validated.id}:${validated.revision}`,
      itemId: validated.id,
      revision: validated.revision,
      updatedAt: validated.updatedAt,
      operation: validated.deletedAt ? "delete" : "upsert",
    };
    transaction.objectStore("outbox").put(operation);
  }
  await transactionDone(transaction);
}

export async function getItem(database: IDBDatabase, id: string): Promise<Item | undefined> {
  const transaction = database.transaction("items", "readonly");
  const record = await requestResult(transaction.objectStore("items").get(id) as IDBRequest<StoredCiphertext | undefined>);
  await transactionDone(transaction);
  if (!record) return undefined;
  const plaintext = await decryptLocal(database, record, `item:${id}`);
  try {
    return itemSchema.parse(JSON.parse(new TextDecoder().decode(plaintext)));
  } finally {
    plaintext.fill(0);
  }
}

export async function listItems(database: IDBDatabase): Promise<Item[]> {
  const transaction = database.transaction("items", "readonly");
  const records = await requestResult(transaction.objectStore("items").getAll() as IDBRequest<StoredCiphertext[]>);
  await transactionDone(transaction);
  const items = await Promise.all(records.map((record) => getItem(database, record.id)));
  return items.filter((item): item is Item => Boolean(item));
}

function safeFilename(name: string): string {
  const cleaned = name.replace(/[\\/]/g, "_").replace(/\p{Cc}/gu, "_").replace(/^\.+/, "").trim();
  return (cleaned || "attachment").slice(0, 255);
}

export async function saveAttachment(database: IDBDatabase, file: File): Promise<AttachmentRef> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("Attachments are limited to 25 MB in this release");
  const reference = { id: uuidV7(), name: safeFilename(file.name), mimeType: file.type || "application/octet-stream", size: file.size };
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    await storeAttachmentBytes(database, reference, bytes);
    return reference;
  } finally {
    bytes.fill(0);
  }
}

export async function storeAttachmentBytes(database: IDBDatabase, attachment: AttachmentRef, bytes: Uint8Array): Promise<void> {
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new Error("Attachments are limited to 25 MB in this release");
  if (bytes.byteLength !== attachment.size) throw new Error("Attachment size does not match its metadata");
  const encrypted = await encryptLocal(database, bytes, `attachment:${attachment.id}`);
  const transaction = database.transaction("attachments", "readwrite");
  transaction.objectStore("attachments").put({
    id: attachment.id,
    updatedAt: new Date().toISOString(),
    size: attachment.size,
    ...encrypted,
  } satisfies StoredAttachment);
  await transactionDone(transaction);
}

export async function readAttachment(database: IDBDatabase, attachment: AttachmentRef): Promise<Blob> {
  const transaction = database.transaction("attachments", "readonly");
  const record = await requestResult(transaction.objectStore("attachments").get(attachment.id) as IDBRequest<StoredAttachment | undefined>);
  await transactionDone(transaction);
  if (!record) throw new Error("This attachment is not available on this device");
  const plaintext = await decryptLocal(database, record, `attachment:${attachment.id}`);
  return new Blob([Uint8Array.from(plaintext).buffer], { type: attachment.mimeType });
}

export async function hasAttachment(database: IDBDatabase, id: string): Promise<boolean> {
  const transaction = database.transaction("attachments", "readonly");
  const key = await requestResult(transaction.objectStore("attachments").getKey(id));
  await transactionDone(transaction);
  return key !== undefined;
}

export async function deleteAttachment(database: IDBDatabase, id: string): Promise<void> {
  const transaction = database.transaction("attachments", "readwrite");
  transaction.objectStore("attachments").delete(id);
  await transactionDone(transaction);
}

export async function listOutbox(database: IDBDatabase): Promise<OutboxOperation[]> {
  const transaction = database.transaction("outbox", "readonly");
  const operations = await requestResult(transaction.objectStore("outbox").getAll() as IDBRequest<OutboxOperation[]>);
  await transactionDone(transaction);
  return operations.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
}

export async function acknowledgeOutbox(database: IDBDatabase, ids: string[]): Promise<void> {
  const transaction = database.transaction("outbox", "readwrite");
  ids.forEach((id) => transaction.objectStore("outbox").delete(id));
  await transactionDone(transaction);
}

export async function clearVault(database: IDBDatabase): Promise<void> {
  const transaction = database.transaction(["items", "attachments", "outbox"], "readwrite");
  transaction.objectStore("items").clear();
  transaction.objectStore("attachments").clear();
  transaction.objectStore("outbox").clear();
  await transactionDone(transaction);
}

export async function inspectEncryptedLocalRecords(database: IDBDatabase): Promise<StoredCiphertext[]> {
  const transaction = database.transaction("items", "readonly");
  const records = await requestResult(transaction.objectStore("items").getAll() as IDBRequest<StoredCiphertext[]>);
  await transactionDone(transaction);
  return records;
}
