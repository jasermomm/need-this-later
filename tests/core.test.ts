import { describe, expect, it } from "vitest";
import { createItem, inferDraft, itemSchema, updateItem, uuidV7 } from "../packages/core/src/model";
import { searchItems } from "../packages/search/src/search";

describe("item model", () => {
  it("recognizes ordinary notes and safe web links without a type picker", () => {
    expect(inferDraft("remember this").kind).toBe("note");
    expect(inferDraft("https://example.com/article")).toMatchObject({ kind: "link", domain: "example.com" });
    expect(inferDraft("javascript:alert(1)").kind).toBe("note");
  });

  it("creates sortable UUIDv7 identifiers", () => {
    expect(uuidV7(1_000, new Uint8Array(10))).toMatch(/^[0-9a-f-]{36}$/);
    expect(uuidV7(1_000, new Uint8Array(10)) < uuidV7(2_000, new Uint8Array(10))).toBe(true);
  });

  it("preserves Unicode, Arabic, emoji, revisions, and immutable identity", () => {
    const item = createItem({ kind: "note", content: "تذكّر هذا لاحقًا 🔐", tags: ["بحث", "بحث"] }, "device-a", new Date("2026-01-01T00:00:00.000Z"));
    const edited = updateItem(item, { content: `${item.content}\nupdated` }, "device-b", new Date("2026-01-02T00:00:00.000Z"));
    expect(itemSchema.parse(edited)).toMatchObject({ id: item.id, revision: 2, deviceId: "device-b", tags: ["بحث"] });
  });
});

describe("local search", () => {
  const items = [
    createItem({ kind: "note", content: "شقة في الرياض", tags: ["apartment"] }, "a", new Date("2026-01-01T00:00:00.000Z")),
    createItem({ kind: "link", content: "https://github.com/openai", url: "https://github.com/openai", domain: "github.com" }, "a", new Date("2026-01-02T00:00:00.000Z")),
  ];

  it.each([
    ["شقة", "note"],
    ["رياض", "note"],
    ["apart", "note"],
    ["github.com", "link"],
    ["OPENAI", "link"],
  ])("finds %s", (query, kind) => expect(searchItems(items, query)[0]?.kind).toBe(kind));

  it("applies status and type filters", () => {
    expect(searchItems(items, "", "link")).toHaveLength(1);
    expect(searchItems(items, "", "image")).toHaveLength(0);
  });
});
