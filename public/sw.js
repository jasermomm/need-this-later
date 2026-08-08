const CACHE = "need-this-later-v1";
const APP_SHELL = ["./", "./manifest.webmanifest", "./favicon.svg"];
const DB_NAME = "need-this-later";
const DB_VERSION = 3;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener("error", () => reject(transaction.error), { once: true });
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("meta")) database.createObjectStore("meta");
      if (!database.objectStoreNames.contains("items")) database.createObjectStore("items", { keyPath: "id" });
      if (!database.objectStoreNames.contains("attachments")) database.createObjectStore("attachments", { keyPath: "id" });
      if (!database.objectStoreNames.contains("outbox")) database.createObjectStore("outbox", { keyPath: "id" });
    });
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function uuidV7() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let time = BigInt(Date.now());
  for (let index = 5; index >= 0; index -= 1) { bytes[index] = Number(time & 255n); time >>= 8n; }
  bytes[6] = (bytes[6] & 15) | 112;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function getMeta(database, name) {
  const transaction = database.transaction("meta", "readonly");
  const result = await requestResult(transaction.objectStore("meta").get(name));
  await transactionDone(transaction);
  return result;
}

async function getOrCreateMeta(database, name, create) {
  const existing = await getMeta(database, name);
  if (existing) return existing;
  const value = await create();
  const transaction = database.transaction("meta", "readwrite");
  transaction.objectStore("meta").put(value, name);
  await transactionDone(transaction);
  return value;
}

async function encrypt(key, plaintext, context) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(context), tagLength: 128 }, key, plaintext);
  return { iv: iv.buffer, ciphertext };
}

async function handleShareTarget(request) {
  const form = await request.formData();
  const title = String(form.get("title") || "").trim();
  const text = String(form.get("text") || "").trim();
  const sharedUrl = String(form.get("url") || "").trim();
  const files = form.getAll("files").filter((entry) => entry instanceof File && entry.size <= 25 * 1024 * 1024);
  const database = await openDatabase();
  const key = await getOrCreateMeta(database, "device-key", () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]));
  const deviceId = await getOrCreateMeta(database, "device-id", async () => uuidV7());
  const attachments = [];
  for (const file of files) {
    const id = uuidV7();
    const bytes = await file.arrayBuffer();
    const encrypted = await encrypt(key, bytes, `attachment:${id}`);
    const transaction = database.transaction("attachments", "readwrite");
    transaction.objectStore("attachments").put({ id, updatedAt: new Date().toISOString(), size: file.size, ...encrypted });
    await transactionDone(transaction);
    attachments.push({ id, name: file.name.replace(/[\\/]/g, "_").replace(/\p{Cc}/gu, "_").slice(0, 255) || "attachment", mimeType: file.type || "application/octet-stream", size: file.size });
  }
  let validUrl;
  try { const parsed = new URL(sharedUrl || text); if (["http:", "https:"].includes(parsed.protocol)) validUrl = parsed; } catch { /* Shared text does not have to be a URL. */ }
  const timestamp = new Date().toISOString();
  const id = uuidV7();
  const kind = attachments.length ? (attachments.every((entry) => entry.mimeType.startsWith("image/")) ? "image" : "file") : validUrl ? "link" : "note";
  const item = {
    schemaVersion: 1, id, kind, title, content: text || sharedUrl || attachments[0]?.name || title, url: validUrl?.toString(), domain: validUrl?.hostname.replace(/^www\./, ""), note: "", tags: [], attachments,
    source: { application: "Web Share" }, createdAt: timestamp, updatedAt: timestamp, reminderAt: null, pinned: false, archived: false, deletedAt: null, revision: 1, deviceId,
  };
  const encrypted = await encrypt(key, new TextEncoder().encode(JSON.stringify(item)), `item:${id}`);
  const transaction = database.transaction(["items", "outbox"], "readwrite");
  transaction.objectStore("items").put({ id, updatedAt: timestamp, ...encrypted });
  transaction.objectStore("outbox").put({ id: `${id}:1`, itemId: id, revision: 1, updatedAt: timestamp, operation: "upsert" });
  await transactionDone(transaction);
  database.close();
  return Response.redirect(new URL("./", self.registration.scope), 303);
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname.endsWith("/share-target")) {
    event.respondWith(handleShareTarget(event.request));
    return;
  }
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => event.request.mode === "navigate" ? caches.match("./") : undefined)));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => clients[0]?.focus() || self.clients.openWindow("./")));
});
