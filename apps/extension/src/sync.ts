import { createItem } from "../../../packages/core/src/model";
import { base64UrlToBytes, bytesToBase64Url, encryptJson, unlockVault, type VaultHeader } from "../../../packages/crypto/src/vault";
import { SupabaseAuthClient } from "../../../packages/sync/src/engine";
import type { ExtensionCapture } from "./storage";

const api: typeof chrome = (globalThis as typeof globalThis & { browser?: typeof chrome }).browser ?? chrome;

interface ExtensionSyncSession {
  baseUrl: string;
  anonymousKey: string;
  accessToken: string;
  userId: string;
  deviceId: string;
  masterKey: string;
}

async function session(): Promise<ExtensionSyncSession | null> {
  const result = await api.storage.session.get("syncSession");
  return (result.syncSession as ExtensionSyncSession | undefined) ?? null;
}

export async function unlockExtensionSync(baseUrl: string, anonymousKey: string, email: string, accountPassword: string, vaultPassword: string): Promise<void> {
  const endpoint = new URL(baseUrl);
  if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost" && endpoint.hostname !== "127.0.0.1") throw new Error("Sync requires HTTPS");
  const authenticated = await new SupabaseAuthClient(baseUrl, anonymousKey).signIn(email, accountPassword);
  const query = new URLSearchParams({ select: "header", user_id: `eq.${authenticated.userId}`, limit: "1" });
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/v1/vault_headers?${query}`, { headers: { apikey: anonymousKey, Authorization: `Bearer ${authenticated.accessToken}` } });
  if (!response.ok) throw new Error("Could not read the encrypted vault header");
  const rows = await response.json() as Array<{ header: VaultHeader }>;
  if (!rows[0]) throw new Error("Create an encrypted vault in the web app first");
  const masterKey = await unlockVault(vaultPassword, rows[0].header);
  const local = await api.storage.local.get("syncDeviceId");
  const deviceId = String(local.syncDeviceId || crypto.randomUUID());
  await api.storage.local.set({ syncDeviceId: deviceId, syncBaseUrl: baseUrl, syncAnonymousKey: anonymousKey });
  await api.storage.session.set({ syncSession: { baseUrl, anonymousKey, accessToken: authenticated.accessToken, userId: authenticated.userId, deviceId, masterKey: bytesToBase64Url(masterKey) } satisfies ExtensionSyncSession });
  masterKey.fill(0);
}

export async function extensionSyncStatus(): Promise<boolean> {
  return Boolean(await session());
}

export async function syncCaptureIfUnlocked(capture: ExtensionCapture): Promise<boolean> {
  const active = await session();
  if (!active) return false;
  const masterKey = base64UrlToBytes(active.masterKey);
  try {
    let parsedUrl: URL | undefined;
    try { const candidate = new URL(capture.url || capture.content); if (["http:", "https:"].includes(candidate.protocol)) parsedUrl = candidate; } catch { /* Notes do not need a URL. */ }
    const item = createItem({
      kind: parsedUrl ? "link" : "note",
      title: capture.title,
      content: capture.content,
      url: parsedUrl?.toString(),
      domain: parsedUrl?.hostname.replace(/^www\./, ""),
      tags: capture.tags,
      source: { application: "Browser extension", pageTitle: capture.title, pageUrl: capture.url, selectedText: capture.kind === "selection" ? capture.content : undefined },
    }, active.deviceId, new Date(capture.createdAt));
    const payload = encryptJson(item, masterKey, `sync-item:${item.id}:revision:${item.revision}`);
    const response = await fetch(`${active.baseUrl.replace(/\/$/, "")}/rest/v1/encrypted_items?on_conflict=id`, {
      method: "POST",
      headers: { apikey: active.anonymousKey, Authorization: `Bearer ${active.accessToken}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: item.id, user_id: active.userId, revision: item.revision, updated_at: item.updatedAt, device_id: item.deviceId, deleted: false, payload }),
    });
    if (!response.ok) throw new Error(`Encrypted sync failed (${response.status})`);
    return true;
  } finally {
    masterKey.fill(0);
  }
}
