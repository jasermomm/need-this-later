import type { Item, ItemKind } from "../../core/src/model";

export type ItemFilter = "all" | ItemKind | "pinned" | "archived" | "trash";

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

export function searchableText(item: Item): string {
  return normalize([
    item.title,
    item.content,
    item.note,
    item.url,
    item.domain,
    ...item.tags,
    ...item.attachments.map((attachment) => attachment.name),
    item.source.application,
    item.source.pageTitle,
    item.source.pageUrl,
    item.source.selectedText,
  ].filter(Boolean).join(" \n"));
}

export function matchesFilter(item: Item, filter: ItemFilter): boolean {
  if (filter === "trash") return item.deletedAt !== null;
  if (item.deletedAt) return false;
  if (filter === "archived") return item.archived;
  if (item.archived) return false;
  if (filter === "pinned") return item.pinned;
  if (filter === "all") return true;
  return item.kind === filter;
}

export function searchItems(items: Item[], query: string, filter: ItemFilter = "all"): Item[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return items
    .filter((item) => matchesFilter(item, filter))
    .filter((item) => {
      if (!terms.length) return true;
      const haystack = searchableText(item);
      return terms.every((term) => haystack.includes(term));
    })
    .sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      return right.createdAt.localeCompare(left.createdAt);
    });
}

export function groupByDomain(items: Item[]): Array<{ domain: string; count: number }> {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    if (item.domain && !item.deletedAt) counts.set(item.domain, (counts.get(item.domain) ?? 0) + 1);
  });
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([domain, count]) => ({ domain, count }))
    .sort((left, right) => right.count - left.count || left.domain.localeCompare(right.domain));
}
