import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createEncryptedBackup, readEncryptedBackup, restoreBackup } from "../packages/backup/src/backup";
import { createItem } from "../packages/core/src/model";
import { clearVault, getDeviceId, inspectEncryptedLocalRecords, listItems, openLocalDatabase, readAttachment, saveAttachment, saveItem } from "../packages/database/src/indexeddb";

const databases: IDBDatabase[] = [];
afterEach(() => databases.splice(0).forEach((database) => database.close()));

describe("encrypted local persistence and backups", () => {
  it("stores item content as ciphertext and restores exact content plus attachments", async () => {
    const database = await openLocalDatabase(`backup-${crypto.randomUUID()}`);
    databases.push(database);
    const deviceId = await getDeviceId(database);
    const file = new File(["attachment contents"], "../unsafe-name.txt", { type: "text/plain" });
    const attachment = await saveAttachment(database, file);
    const item = createItem({ kind: "file", content: "سري للغاية 🔐", attachments: [attachment], tags: ["private"] }, deviceId);
    await saveItem(database, item);

    const raw = await inspectEncryptedLocalRecords(database);
    expect(JSON.stringify(raw)).not.toContain("سري للغاية");
    expect(attachment.name).toBe("_unsafe-name.txt");

    const serialized = await createEncryptedBackup(database, [item], "backup password 123");
    expect(serialized).not.toContain("سري للغاية");
    const restored = await readEncryptedBackup(serialized, "backup password 123");

    await clearVault(database);
    expect(await listItems(database)).toHaveLength(0);
    await restoreBackup(database, restored);
    expect(await listItems(database)).toEqual([item]);
    expect(await (await readAttachment(database, attachment)).text()).toBe("attachment contents");
  });

  it("refuses an incorrect encrypted-backup password", async () => {
    const database = await openLocalDatabase(`backup-wrong-${crypto.randomUUID()}`);
    databases.push(database);
    const serialized = await createEncryptedBackup(database, [], "backup password 123");
    await expect(readEncryptedBackup(serialized, "another wrong password")).rejects.toThrow(/incorrect|damaged/);
  });
});
