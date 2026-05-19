import Dexie, { type Table } from "dexie";
import type { HighlightRecord, PageRecord } from "./types";

class LiucaiDatabase extends Dexie {
  pages!: Table<PageRecord, string>;
  highlights!: Table<HighlightRecord, string>;

  constructor() {
    super("liucai");
    this.version(1).stores({
      pages: "id, canonicalUrl, updatedAt, lastOpenedAt",
      highlights: "id, pageId, canonicalUrl, updatedAt, deletedAt",
    });
    this.version(2)
      .stores({
        pages: "id, canonicalUrl, updatedAt, lastOpenedAt",
        highlights: "id, pageId, canonicalUrl, updatedAt, deletedAt, *tags",
      })
      .upgrade(async (tx) => {
        await tx.table("highlights").toCollection().modify((record: Partial<HighlightRecord>) => {
          if (!Array.isArray(record.tags)) {
            record.tags = [];
          }
        });
      });
  }
}

export const db = new LiucaiDatabase();

export async function upsertPage(canonicalUrl: string, originalUrl: string, title: string): Promise<PageRecord> {
  const now = new Date().toISOString();
  const existing = await db.pages.where("canonicalUrl").equals(canonicalUrl).first();

  if (existing) {
    const updated: PageRecord = {
      ...existing,
      originalUrl,
      title: title || existing.title,
      updatedAt: now,
      lastOpenedAt: now,
    };
    await db.pages.put(updated);
    return updated;
  }

  const page: PageRecord = {
    id: crypto.randomUUID(),
    canonicalUrl,
    originalUrl,
    title,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  };
  await db.pages.add(page);
  return page;
}

export async function getActiveHighlights(canonicalUrl: string): Promise<HighlightRecord[]> {
  const records = await db.highlights.where("canonicalUrl").equals(canonicalUrl).toArray();
  return records
    .filter((record) => !record.deletedAt)
    .map((record) => ({ ...record, tags: Array.isArray(record.tags) ? record.tags : [] }))
    .sort((a, b) => a.selector.start - b.selector.start);
}
