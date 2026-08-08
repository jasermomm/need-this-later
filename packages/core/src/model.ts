import { z } from "zod";

export const ITEM_SCHEMA_VERSION = 1;

export const itemKindSchema = z.enum(["note", "link", "image", "file"]);
export type ItemKind = z.infer<typeof itemKindSchema>;

export const attachmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  mimeType: z.string().max(200),
  size: z.number().int().nonnegative(),
});

export const itemSchema = z.object({
  schemaVersion: z.literal(ITEM_SCHEMA_VERSION),
  id: z.string().uuid(),
  kind: itemKindSchema,
  title: z.string().max(500).default(""),
  content: z.string().max(2_000_000).default(""),
  url: z.string().url().max(8_192).optional(),
  domain: z.string().max(253).optional(),
  note: z.string().max(100_000).default(""),
  tags: z.array(z.string().min(1).max(60)).max(50).default([]),
  attachments: z.array(attachmentSchema).max(20).default([]),
  source: z.object({
    application: z.string().max(120).optional(),
    pageTitle: z.string().max(500).optional(),
    pageUrl: z.string().url().max(8_192).optional(),
    selectedText: z.string().max(100_000).optional(),
  }).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  reminderAt: z.string().datetime().nullable().default(null),
  pinned: z.boolean().default(false),
  archived: z.boolean().default(false),
  deletedAt: z.string().datetime().nullable().default(null),
  revision: z.number().int().positive(),
  deviceId: z.string().min(1).max(100),
});

export type Item = z.infer<typeof itemSchema>;
export type AttachmentRef = z.infer<typeof attachmentSchema>;

export type ItemDraft = Pick<Item, "kind" | "content"> &
  Partial<Pick<Item, "title" | "url" | "domain" | "note" | "tags" | "attachments" | "source" | "reminderAt">>;

export function uuidV7(now = Date.now(), random = secureRandom(10)): string {
  if (random.length !== 10) throw new Error("UUIDv7 requires 10 random bytes");
  const bytes = new Uint8Array(16);
  let timestamp = BigInt(now);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }
  bytes.set(random, 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function secureRandom(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function inferDraft(input: string): ItemDraft {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return {
        kind: "link",
        content: trimmed,
        url: url.toString(),
        domain: url.hostname.replace(/^www\./, ""),
        title: "",
      };
    }
  } catch {
    // Ordinary text is the common path.
  }
  return { kind: "note", content: input, title: "" };
}

export function createItem(draft: ItemDraft, deviceId: string, now = new Date()): Item {
  const timestamp = now.toISOString();
  return itemSchema.parse({
    schemaVersion: ITEM_SCHEMA_VERSION,
    id: uuidV7(now.getTime()),
    kind: draft.kind,
    title: draft.title ?? "",
    content: draft.content,
    url: draft.url,
    domain: draft.domain,
    note: draft.note ?? "",
    tags: normalizeTags(draft.tags ?? []),
    attachments: draft.attachments ?? [],
    source: draft.source ?? {},
    createdAt: timestamp,
    updatedAt: timestamp,
    reminderAt: draft.reminderAt ?? null,
    pinned: false,
    archived: false,
    deletedAt: null,
    revision: 1,
    deviceId,
  });
}

export function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().replace(/^#/, "").toLocaleLowerCase()).filter(Boolean))].slice(0, 50);
}

export function updateItem(item: Item, patch: Partial<Item>, deviceId: string, now = new Date()): Item {
  return itemSchema.parse({
    ...item,
    ...patch,
    id: item.id,
    schemaVersion: ITEM_SCHEMA_VERSION,
    createdAt: item.createdAt,
    updatedAt: now.toISOString(),
    revision: item.revision + 1,
    deviceId,
  });
}

export function itemLabel(item: Item): string {
  if (item.title.trim()) return item.title.trim();
  if (item.kind === "link" && item.domain) return item.domain;
  if (item.attachments[0]?.name) return item.attachments[0].name;
  return item.content.trim().split(/\r?\n/, 1)[0]?.slice(0, 120) || "Untitled item";
}
