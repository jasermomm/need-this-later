import { itemSchema, updateItem, uuidV7, type Item } from "../../core/src/model";
import { decryptBytes, decryptJson, encryptBytes, encryptJson, packCipherEnvelope, unpackCipherEnvelope, type CipherEnvelope } from "../../crypto/src/vault";
import { acknowledgeOutbox, getItem, hasAttachment, listOutbox, readAttachment, saveItem, storeAttachmentBytes } from "../../database/src/indexeddb";

export interface RemoteItemRow {
  id: string;
  userId: string;
  revision: number;
  updatedAt: string;
  deviceId: string;
  deleted: boolean;
  payload: CipherEnvelope;
}

export interface SyncTransport {
  pull(since: string | null): Promise<RemoteItemRow[]>;
  push(rows: RemoteItemRow[]): Promise<void>;
  pullAttachment?(userId: string, itemId: string, attachmentId: string): Promise<Uint8Array | null>;
  pushAttachment?(userId: string, itemId: string, attachmentId: string, ciphertext: Uint8Array): Promise<void>;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  cursor: string | null;
}

function purpose(id: string, revision: number): string {
  return `sync-item:${id}:revision:${revision}`;
}

export class SyncEngine {
  constructor(
    private readonly database: IDBDatabase,
    private readonly transport: SyncTransport,
    private readonly masterKey: Uint8Array,
    private readonly userId: string,
    private readonly deviceId: string,
  ) {}

  async synchronize(cursor: string | null): Promise<SyncResult> {
    let pushed = 0;
    let pulled = 0;
    let conflicts = 0;

    const operations = await listOutbox(this.database);
    const rows: RemoteItemRow[] = [];
    for (const operation of operations) {
      const item = await getItem(this.database, operation.itemId);
      if (!item || item.revision !== operation.revision) continue;
      rows.push({
        id: item.id,
        userId: this.userId,
        revision: item.revision,
        updatedAt: item.updatedAt,
        deviceId: item.deviceId,
        deleted: Boolean(item.deletedAt),
        payload: encryptJson(item, this.masterKey, purpose(item.id, item.revision)),
      });
      if (this.transport.pushAttachment) {
        for (const attachment of item.attachments) {
          const bytes = new Uint8Array(await (await readAttachment(this.database, attachment)).arrayBuffer());
          try {
            const encrypted = packCipherEnvelope(encryptBytes(bytes, this.masterKey, `sync-attachment:${attachment.id}`));
            await this.transport.pushAttachment(this.userId, item.id, attachment.id, encrypted);
          } finally {
            bytes.fill(0);
          }
        }
      }
    }
    if (rows.length) {
      await this.transport.push(rows);
      await acknowledgeOutbox(this.database, operations.map((operation) => operation.id));
      pushed = rows.length;
    }

    const remoteRows = await this.transport.pull(cursor);
    for (const row of remoteRows) {
      if (row.userId !== this.userId) throw new Error("The sync transport returned another user's record");
      const remoteItem = itemSchema.parse(decryptJson(row.payload, this.masterKey, purpose(row.id, row.revision)));
      if (remoteItem.id !== row.id || remoteItem.revision !== row.revision || remoteItem.updatedAt !== row.updatedAt) {
        throw new Error("Encrypted sync metadata does not match its authenticated payload");
      }
      const local = await getItem(this.database, row.id);
      if (!local || local.revision < remoteItem.revision) {
        if (this.transport.pullAttachment) {
          for (const attachment of remoteItem.attachments) {
            if (await hasAttachment(this.database, attachment.id)) continue;
            const encrypted = await this.transport.pullAttachment(this.userId, remoteItem.id, attachment.id);
            if (!encrypted) throw new Error("An encrypted attachment referenced by sync is missing");
            const plaintext = decryptBytes(unpackCipherEnvelope(encrypted), this.masterKey, `sync-attachment:${attachment.id}`);
            try {
              await storeAttachmentBytes(this.database, attachment, plaintext);
            } finally {
              plaintext.fill(0);
            }
          }
        }
        await saveItem(this.database, remoteItem, false);
        pulled += 1;
        continue;
      }
      const concurrent = local.revision === remoteItem.revision
        && local.deviceId !== remoteItem.deviceId
        && JSON.stringify(local) !== JSON.stringify(remoteItem);
      if (concurrent) {
        const now = new Date(Math.max(Date.parse(local.updatedAt), Date.parse(remoteItem.updatedAt)) + 1);
        const duplicate = itemSchema.parse({
          ...remoteItem,
          id: uuidV7(now.getTime()),
          title: `${remoteItem.title || "Untitled"} (conflict copy)`,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          revision: 1,
          deviceId: this.deviceId,
        });
        await saveItem(this.database, duplicate, true);
        conflicts += 1;
      }
    }

    const nextCursor = remoteRows.reduce<string | null>((latest, row) => {
      if (!latest || row.updatedAt > latest) return row.updatedAt;
      return latest;
    }, cursor);
    return { pushed, pulled, conflicts, cursor: nextCursor };
  }
}

export class MemorySyncTransport implements SyncTransport {
  private readonly rows = new Map<string, RemoteItemRow>();
  private readonly attachments = new Map<string, Uint8Array>();

  async pull(since: string | null): Promise<RemoteItemRow[]> {
    return [...this.rows.values()]
      .filter((row) => !since || row.updatedAt >= since)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  }

  async push(rows: RemoteItemRow[]): Promise<void> {
    rows.forEach((row) => {
      const existing = this.rows.get(row.id);
      if (!existing || row.revision > existing.revision || (row.revision === existing.revision && row.updatedAt > existing.updatedAt)) {
        this.rows.set(row.id, structuredClone(row));
      }
    });
  }

  async pullAttachment(userId: string, itemId: string, attachmentId: string): Promise<Uint8Array | null> {
    const value = this.attachments.get(`${userId}/${itemId}/${attachmentId}`);
    return value ? Uint8Array.from(value) : null;
  }

  async pushAttachment(userId: string, itemId: string, attachmentId: string, ciphertext: Uint8Array): Promise<void> {
    this.attachments.set(`${userId}/${itemId}/${attachmentId}`, Uint8Array.from(ciphertext));
  }

  inspect(): RemoteItemRow[] {
    return [...this.rows.values()].map((row) => structuredClone(row));
  }

  inspectAttachments(): Uint8Array[] {
    return [...this.attachments.values()].map((value) => Uint8Array.from(value));
  }
}

export interface SupabaseSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
  expiresAt: number;
}

interface SupabaseAuthResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id?: string };
  error_description?: string;
  msg?: string;
}

export class SupabaseAuthClient {
  constructor(private readonly baseUrl: string, private readonly anonymousKey: string) {}

  private async request(path: string, body: unknown): Promise<SupabaseSession> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/auth/v1/${path}`, {
      method: "POST",
      headers: { apikey: this.anonymousKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json() as SupabaseAuthResponse;
    if (path === "signup" && response.ok && data.user?.id && !data.access_token) {
      throw new Error("Account created. Check your email, confirm the account, then return here and choose Sign in.");
    }
    if (!response.ok || !data.access_token || !data.refresh_token || !data.user?.id) {
      throw new Error(data.error_description || data.msg || "Supabase authentication failed");
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      userId: data.user.id,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
  }

  signUp(email: string, password: string): Promise<SupabaseSession> {
    return this.request("signup", { email, password });
  }

  signIn(email: string, password: string): Promise<SupabaseSession> {
    return this.request("token?grant_type=password", { email, password });
  }

  refreshSession(refreshToken: string): Promise<SupabaseSession> {
    return this.request("token?grant_type=refresh_token", { refresh_token: refreshToken });
  }
}

interface SupabaseRemoteRow {
  id: string;
  user_id: string;
  revision: number;
  updated_at: string;
  device_id: string;
  deleted: boolean;
  payload: CipherEnvelope;
}

export class SupabaseSyncTransport implements SyncTransport {
  constructor(
    private readonly baseUrl: string,
    private readonly anonymousKey: string,
    private readonly accessToken: string,
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      apikey: this.anonymousKey,
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  async pull(since: string | null): Promise<RemoteItemRow[]> {
    const query = new URLSearchParams({ select: "id,user_id,revision,updated_at,device_id,deleted,payload", order: "updated_at.asc" });
    if (since) query.set("updated_at", `gte.${since}`);
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/rest/v1/encrypted_items?${query}`, { headers: this.headers() });
    if (!response.ok) throw new Error(`Sync download failed (${response.status})`);
    const rows = await response.json() as SupabaseRemoteRow[];
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      revision: row.revision,
      updatedAt: row.updated_at,
      deviceId: row.device_id,
      deleted: row.deleted,
      payload: row.payload,
    }));
  }

  async push(rows: RemoteItemRow[]): Promise<void> {
    const payload = rows.map((row) => ({
      id: row.id,
      user_id: row.userId,
      revision: row.revision,
      updated_at: row.updatedAt,
      device_id: row.deviceId,
      deleted: row.deleted,
      payload: row.payload,
    }));
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/rest/v1/encrypted_items?on_conflict=id`, {
      method: "POST",
      headers: this.headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Sync upload failed (${response.status})`);
  }

  private attachmentUrl(userId: string, itemId: string, attachmentId: string): string {
    const path = [userId, itemId, `${attachmentId}.ntl`].map(encodeURIComponent).join("/");
    return `${this.baseUrl.replace(/\/$/, "")}/storage/v1/object/encrypted-attachments/${path}`;
  }

  async pullAttachment(userId: string, itemId: string, attachmentId: string): Promise<Uint8Array | null> {
    const response = await fetch(this.attachmentUrl(userId, itemId, attachmentId), { headers: this.headers() });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Attachment download failed (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async pushAttachment(userId: string, itemId: string, attachmentId: string, ciphertext: Uint8Array): Promise<void> {
    const response = await fetch(this.attachmentUrl(userId, itemId, attachmentId), {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/octet-stream", "x-upsert": "true" },
      body: Uint8Array.from(ciphertext),
    });
    if (!response.ok) throw new Error(`Attachment upload failed (${response.status})`);
  }
}

export function markRemoteEdit(item: Item, patch: Partial<Item>, deviceId: string): Item {
  return updateItem(item, patch, deviceId);
}
