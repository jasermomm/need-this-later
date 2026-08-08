import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createItem, updateItem } from "../packages/core/src/model";
import { createVault, encryptJson } from "../packages/crypto/src/vault";
import { getDeviceId, getItem, openLocalDatabase, readAttachment, saveAttachment, saveItem } from "../packages/database/src/indexeddb";
import { MemorySyncTransport, SupabaseAuthClient, SyncEngine, type RemoteItemRow, type SyncTransport } from "../packages/sync/src/engine";

const databases: IDBDatabase[] = [];
afterEach(() => {
  databases.splice(0).forEach((database) => database.close());
  vi.unstubAllGlobals();
});

describe("Supabase authentication", () => {
  it("explains hosted email confirmation instead of reporting an ambiguous failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ user: { id: "11111111-1111-4111-8111-111111111111" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    await expect(new SupabaseAuthClient("https://example.supabase.co", "sb_publishable_test").signUp("person@example.com", "account password"))
      .rejects.toThrow("Account created. Check your email, confirm the account, then return here and choose Sign in.");
  });

  it("refreshes an expiring session with the public client key", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      expires_in: 3600,
      user: { id: "11111111-1111-4111-8111-111111111111" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const session = await new SupabaseAuthClient("https://example.supabase.co", "sb_publishable_test").refreshSession("old-refresh-token");

    expect(session.accessToken).toBe("new-access-token");
    expect(fetchMock).toHaveBeenCalledWith("https://example.supabase.co/auth/v1/token?grant_type=refresh_token", expect.objectContaining({
      headers: { apikey: "sb_publishable_test", "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: "old-refresh-token" }),
    }));
  });
});

describe("offline-first encrypted sync", () => {
  it("moves creates, edits, and tombstones between two devices idempotently", async () => {
    const a = await openLocalDatabase(`sync-a-${crypto.randomUUID()}`);
    const b = await openLocalDatabase(`sync-b-${crypto.randomUUID()}`);
    databases.push(a, b);
    const deviceA = await getDeviceId(a);
    const deviceB = await getDeviceId(b);
    const { masterKey } = await createVault("sync vault password");
    const transport = new MemorySyncTransport();
    const userId = crypto.randomUUID();
    const engineA = new SyncEngine(a, transport, masterKey, userId, deviceA);
    const engineB = new SyncEngine(b, transport, masterKey, userId, deviceB);
    const attachment = await saveAttachment(a, new File(["secret attachment bytes"], "research.txt", { type: "text/plain" }));
    const original = createItem({ kind: "file", content: "created offline", attachments: [attachment] }, deviceA);
    await saveItem(a, original);

    const first = await engineA.synchronize(null);
    await engineB.synchronize(null);
    expect((await getItem(b, original.id))?.content).toBe("created offline");
    expect(await (await readAttachment(b, attachment)).text()).toBe("secret attachment bytes");
    expect(new TextDecoder().decode(transport.inspectAttachments()[0])).not.toContain("secret attachment bytes");

    const edited = updateItem((await getItem(b, original.id))!, { content: "edited on B" }, deviceB, new Date(Date.parse(original.updatedAt) + 1_000));
    await saveItem(b, edited);
    await engineB.synchronize(first.cursor);
    await engineA.synchronize(first.cursor);
    expect((await getItem(a, original.id))?.content).toBe("edited on B");

    const deleted = updateItem((await getItem(a, original.id))!, { deletedAt: new Date().toISOString() }, deviceA);
    await saveItem(a, deleted);
    await engineA.synchronize(null);
    await engineB.synchronize(null);
    expect((await getItem(b, original.id))?.deletedAt).not.toBeNull();

    await engineA.synchronize(null);
    expect(transport.inspect()).toHaveLength(1);
  });

  it("preserves a concurrent remote edit as a conflict copy", async () => {
    const database = await openLocalDatabase(`sync-conflict-${crypto.randomUUID()}`);
    databases.push(database);
    const localDevice = await getDeviceId(database);
    const { masterKey } = await createVault("sync vault password");
    const userId = crypto.randomUUID();
    const base = createItem({ kind: "note", content: "base" }, localDevice, new Date("2026-01-01T00:00:00.000Z"));
    const local = updateItem(base, { content: "local edit" }, localDevice, new Date("2026-01-02T00:00:00.000Z"));
    const remote = updateItem(base, { content: "remote edit" }, "remote-device", new Date("2026-01-02T00:00:00.000Z"));
    await saveItem(database, local, false);
    const row: RemoteItemRow = { id: remote.id, userId, revision: remote.revision, updatedAt: remote.updatedAt, deviceId: remote.deviceId, deleted: false, payload: encryptJson(remote, masterKey, `sync-item:${remote.id}:revision:${remote.revision}`) };
    const transport: SyncTransport = { pull: async () => [row], push: async () => undefined };
    const result = await new SyncEngine(database, transport, masterKey, userId, localDevice).synchronize(null);
    expect(result.conflicts).toBe(1);
  });
});
