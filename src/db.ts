import Dexie, { type Table } from "dexie";
import { generateUuid } from "./id";
import type {
  HighlightRecord,
  OutboxMutation,
  PageRecord,
  SyncEntityType,
  SyncBatchResult,
  SyncStateRecord,
} from "./types";

class LiucaiDatabase extends Dexie {
  pages!: Table<PageRecord, string>;
  highlights!: Table<HighlightRecord, string>;
  outbox!: Table<OutboxMutation, string>;
  syncState!: Table<SyncStateRecord, string>;

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
    this.version(3).stores({
      pages: "id, &canonicalUrl, updatedAt, lastOpenedAt",
      highlights: "id, pageId, canonicalUrl, updatedAt, deletedAt, *tags",
      outbox: "mutationId, [entityType+entityId], createdAt",
      syncState: "key",
    });
  }
}

export const db = new LiucaiDatabase();

export async function upsertPage(canonicalUrl: string, originalUrl: string, title: string): Promise<PageRecord> {
  return db.transaction("rw", db.pages, db.outbox, async () => {
    const now = new Date().toISOString();
    const existing = await db.pages.where("canonicalUrl").equals(canonicalUrl).first();

    if (existing) {
      const changedForSync = existing.originalUrl !== originalUrl || (title && existing.title !== title);
      const updated: PageRecord = {
        ...existing,
        originalUrl,
        title: title || existing.title,
        updatedAt: changedForSync ? now : existing.updatedAt,
        lastOpenedAt: now,
      };
      await db.pages.put(updated);
      if (changedForSync) {
        await enqueueSnapshot("page", updated);
      }
      return updated;
    }

    const page: PageRecord = {
      id: generateUuid(),
      canonicalUrl,
      originalUrl,
      title,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    };
    await db.pages.add(page);
    await enqueueSnapshot("page", page);
    return page;
  });
}

export async function getActiveHighlights(canonicalUrl: string): Promise<HighlightRecord[]> {
  const records = await db.highlights.where("canonicalUrl").equals(canonicalUrl).toArray();
  return records
    .filter((record) => !record.deletedAt)
    .map(normalizeHighlightRecord)
    .sort((a, b) => a.selector.start - b.selector.start);
}

export function normalizeHighlightRecord(record: HighlightRecord): HighlightRecord {
  return { ...record, tags: Array.isArray(record.tags) ? record.tags : [] };
}

export async function getHighlight(id: string): Promise<HighlightRecord | undefined> {
  const record = await db.highlights.get(id);
  return record ? normalizeHighlightRecord(record) : undefined;
}

export async function addHighlight(record: HighlightRecord): Promise<void> {
  const normalized = normalizeHighlightRecord(record);
  await db.transaction("rw", db.highlights, db.outbox, async () => {
    await db.highlights.add(normalized);
    await enqueueSnapshot("highlight", normalized);
  });
}

export async function putHighlight(record: HighlightRecord): Promise<void> {
  const normalized = normalizeHighlightRecord(record);
  await db.transaction("rw", db.highlights, db.outbox, async () => {
    await db.highlights.put(normalized);
    await enqueueSnapshot("highlight", normalized);
  });
}

export async function importLegacyRecords(
  pages: PageRecord[],
  highlights: HighlightRecord[],
): Promise<void> {
  await db.transaction("rw", db.pages, db.highlights, db.outbox, async () => {
    const pageIds = new Map<string, string>();
    for (const page of pages) {
      const existing = await db.pages.where("canonicalUrl").equals(page.canonicalUrl).first();
      pageIds.set(page.canonicalUrl, existing?.id ?? page.id);
      if (!existing) {
        await db.pages.put(page);
        await enqueueSnapshot("page", page);
      } else if (existing.updatedAt < page.updatedAt) {
        const merged = { ...page, id: existing.id };
        await db.pages.put(merged);
        await enqueueSnapshot("page", merged);
      }
    }

    for (const candidate of highlights) {
      let pageId = pageIds.get(candidate.canonicalUrl);
      if (!pageId) {
        const page = await db.pages.where("canonicalUrl").equals(candidate.canonicalUrl).first();
        pageId = page?.id;
      }
      const record = normalizeHighlightRecord({
        ...candidate,
        pageId: pageId ?? candidate.pageId,
      });
      const existing = await db.highlights.get(record.id);
      if (!existing || existing.updatedAt < record.updatedAt) {
        await db.highlights.put(record);
        await enqueueSnapshot("highlight", record);
      }
    }
  });
}

export async function getOutboxBatch(limit = 100, now = new Date()): Promise<OutboxMutation[]> {
  const records = await db.outbox.orderBy("createdAt").toArray();
  return records
    .filter((record) => !record.nextAttemptAt || record.nextAttemptAt <= now.toISOString())
    .slice(0, limit);
}

export async function getOutboxCount(): Promise<number> {
  return db.outbox.count();
}

export async function resetOutboxRetries(): Promise<void> {
  await db.outbox.toCollection().modify((record) => {
    record.retryCount = 0;
    delete record.nextAttemptAt;
    delete record.lastError;
  });
}

export async function recordSyncFailure(mutationIds: string[], message: string): Promise<void> {
  const attemptedAt = Date.now();
  await db.transaction("rw", db.outbox, async () => {
    for (const mutationId of mutationIds) {
      const record = await db.outbox.get(mutationId);
      if (!record) continue;
      const retryCount = record.retryCount + 1;
      const delayMs = Math.min(30 * 60_000, 30_000 * 2 ** Math.min(retryCount - 1, 6));
      await db.outbox.update(mutationId, {
        retryCount,
        nextAttemptAt: new Date(attemptedAt + delayMs).toISOString(),
        lastError: message,
      });
    }
  });
}

export async function getSyncCursor(userId: string): Promise<number> {
  return (await db.syncState.get(cursorKey(userId)))?.cursor ?? 0;
}

export async function getSyncState(userId: string): Promise<SyncStateRecord | undefined> {
  return db.syncState.get(cursorKey(userId));
}

export async function bindLocalDatabaseToUser(userId: string): Promise<void> {
  const binding = await db.syncState.get("bound-account");
  if (binding?.userId && binding.userId !== userId) {
    throw new Error("此浏览器的本地数据已绑定其他账号。为避免数据串号，请先使用原账号登录。");
  }
  if (!binding) {
    await db.syncState.put({ key: "bound-account", cursor: 0, userId });
  }
}

export async function applySyncBatch(userId: string, result: SyncBatchResult): Promise<void> {
  await db.transaction("rw", db.pages, db.highlights, db.outbox, db.syncState, async () => {
    await db.outbox.bulkDelete(result.acknowledgedMutationIds);

    for (const change of result.changes) {
      if (await hasPendingLocalChange(change.entityType, change.entityId, change.payload)) continue;

      if (change.entityType === "page") {
        await applyRemotePage(change.payload as PageRecord);
      } else {
        await applyRemoteHighlight(change.payload as HighlightRecord);
      }
    }

    await db.syncState.put({
      key: cursorKey(userId),
      cursor: result.nextCursor,
      userId,
      lastSyncedAt: new Date().toISOString(),
    });
  });
}

async function hasPendingLocalChange(
  entityType: SyncEntityType,
  entityId: string,
  payload: PageRecord | HighlightRecord,
): Promise<boolean> {
  const direct = await db.outbox
    .where("[entityType+entityId]")
    .equals([entityType, entityId])
    .count();
  if (direct > 0 || entityType !== "page") return direct > 0;

  const canonicalUrl = (payload as PageRecord).canonicalUrl;
  return db.outbox.filter((mutation) => (
    mutation.entityType === "page"
    && (mutation.payload as PageRecord).canonicalUrl === canonicalUrl
  )).count().then((count) => count > 0);
}

export async function recordSyncStateError(userId: string, message: string): Promise<void> {
  const current = await db.syncState.get(cursorKey(userId));
  await db.syncState.put({
    key: cursorKey(userId),
    cursor: current?.cursor ?? 0,
    userId,
    lastSyncedAt: current?.lastSyncedAt,
    lastError: message,
  });
}

async function applyRemotePage(payload: PageRecord): Promise<void> {
  const page = pickPageFields(payload);
  const canonicalMatch = await db.pages.where("canonicalUrl").equals(page.canonicalUrl).first();
  if (canonicalMatch && canonicalMatch.id !== page.id) {
    await db.highlights.where("pageId").equals(canonicalMatch.id).modify({ pageId: page.id });
    await db.pages.delete(canonicalMatch.id);
  }
  await db.pages.put(page);
}

async function applyRemoteHighlight(payload: HighlightRecord): Promise<void> {
  await db.highlights.put(normalizeHighlightRecord(pickHighlightFields(payload)));
}

function pickPageFields(payload: PageRecord): PageRecord {
  return {
    id: payload.id,
    canonicalUrl: payload.canonicalUrl,
    originalUrl: payload.originalUrl,
    title: payload.title,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    lastOpenedAt: payload.lastOpenedAt ?? payload.updatedAt,
  };
}

function pickHighlightFields(payload: HighlightRecord): HighlightRecord {
  return {
    id: payload.id,
    pageId: payload.pageId,
    canonicalUrl: payload.canonicalUrl,
    text: payload.text,
    color: payload.color,
    note: payload.note,
    tags: payload.tags,
    selector: payload.selector,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    ...(payload.deletedAt ? { deletedAt: payload.deletedAt } : {}),
  };
}

function cursorKey(userId: string): string {
  return `cursor:${userId}`;
}

async function enqueueSnapshot(
  entityType: SyncEntityType,
  payload: PageRecord | HighlightRecord,
): Promise<void> {
  await db.outbox.add({
    mutationId: generateUuid(),
    entityType,
    entityId: payload.id,
    operation: "deletedAt" in payload && payload.deletedAt ? "delete" : "upsert",
    payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  });
}
