import Dexie, { type Table } from "dexie";
import { importLegacyRecords } from "./storageClient";
import type { HighlightRecord, PageRecord } from "./types";

const LEGACY_DATABASE_NAME = "liucai";
const MIGRATION_KEY_PREFIX = "liucaiLegacyMigration:";
const IMPORT_BATCH_SIZE = 100;

class LegacyLiucaiDatabase extends Dexie {
  pages!: Table<PageRecord, string>;
  highlights!: Table<HighlightRecord, string>;

  constructor() {
    super(LEGACY_DATABASE_NAME);
    this.version(1).stores({
      pages: "id, canonicalUrl, updatedAt, lastOpenedAt",
      highlights: "id, pageId, canonicalUrl, updatedAt, deletedAt",
    });
    this.version(2).stores({
      pages: "id, canonicalUrl, updatedAt, lastOpenedAt",
      highlights: "id, pageId, canonicalUrl, updatedAt, deletedAt, *tags",
    });
  }
}

export async function migrateLegacySiteData(origin = location.origin): Promise<void> {
  const migrationKey = `${MIGRATION_KEY_PREFIX}${origin}`;
  const migrationState = await chrome.storage.local.get(migrationKey);
  if (migrationState[migrationKey] === true || !await legacyDatabaseExists()) {
    return;
  }

  const legacyDb = new LegacyLiucaiDatabase();
  try {
    const [pages, highlights] = await Promise.all([
      legacyDb.pages.toArray(),
      legacyDb.highlights.toArray(),
    ]);

    if (highlights.length === 0) {
      await importLegacyRecords(pages, []);
    } else {
      for (let offset = 0; offset < highlights.length; offset += IMPORT_BATCH_SIZE) {
        await importLegacyRecords(
          offset === 0 ? pages : [],
          highlights.slice(offset, offset + IMPORT_BATCH_SIZE),
        );
      }
    }
    await chrome.storage.local.set({ [migrationKey]: true });
  } finally {
    legacyDb.close();
  }
}

async function legacyDatabaseExists(): Promise<boolean> {
  if (typeof indexedDB.databases !== "function") {
    return false;
  }
  const databases = await indexedDB.databases();
  return databases.some((database) => database.name === LEGACY_DATABASE_NAME);
}
