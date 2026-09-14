import Dexie, { type Table } from "dexie";
import { MAX_NOTE_LENGTH } from "../ai/aiNote";
import { generateUuid } from "../shared/id";
import type {
  HighlightDeletePayload,
  HighlightRecord,
  OutboxMutation,
  PageRecord,
  SyncEntityType,
  SyncBatchResult,
  SyncStateRecord,
} from "../shared/types";

export class LiucaiDatabase extends Dexie {
  pages!: Table<PageRecord, string>;
  highlights!: Table<HighlightRecord, string>;
  outbox!: Table<OutboxMutation, string>;
  syncState!: Table<SyncStateRecord, string>;

  constructor(name: string) {
    super(name);
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

const LEGACY_DATABASE_NAME = "liucai";
const GUEST_DATABASE_NAME = "liucai-guest-v1";
const ACCOUNT_DATABASE_PREFIX = "liucai-account-v1:";
const LEGACY_MIGRATION_KEY = "migration:legacy-database:v1";

const databases = new Map<string, LiucaiDatabase>();
let activeUserId: string | null = null;
let activationSequence = 0;
let legacyMigration: Promise<void> | null = null;

/** Live binding retained for existing direct consumers and database tests. */
export let db = getOrCreateDatabase(GUEST_DATABASE_NAME);

export async function activateLocalDatabase(userId: string | null): Promise<LiucaiDatabase> {
  const sequence = ++activationSequence;
  await ensureLegacyMigration();
  const database = getOrCreateDatabase(databaseName(userId));
  await database.open();
  if (sequence === activationSequence) {
    db = database;
    activeUserId = userId;
  }
  return database;
}

export function isActiveLocalDatabase(database: LiucaiDatabase, userId: string): boolean {
  return db === database && activeUserId === userId;
}

async function ensureLegacyMigration(): Promise<void> {
  legacyMigration ??= migrateLegacyDatabase().catch((error) => {
    legacyMigration = null;
    throw error;
  });
  return legacyMigration;
}

async function migrateLegacyDatabase(): Promise<void> {
  if (!(await Dexie.exists(LEGACY_DATABASE_NAME))) return;

  const legacy = new LiucaiDatabase(LEGACY_DATABASE_NAME);
  try {
    await legacy.open();
    const binding = await legacy.syncState.get("bound-account");
    const targetUserId = binding?.userId ?? null;
    const target = getOrCreateDatabase(databaseName(targetUserId));
    await target.open();
    if (await target.syncState.get(LEGACY_MIGRATION_KEY)) return;

    const [pages, highlights, outbox, syncState] = await Promise.all([
      legacy.pages.toArray(),
      legacy.highlights.toArray(),
      legacy.outbox.toArray(),
      legacy.syncState.toArray(),
    ]);
    await target.transaction("rw", target.pages, target.highlights, target.outbox, target.syncState, async () => {
      await target.pages.bulkPut(pages);
      await target.highlights.bulkPut(highlights);
      await target.outbox.bulkPut(outbox);
      await target.syncState.bulkPut(syncState);
      await target.syncState.put({ key: LEGACY_MIGRATION_KEY, cursor: 0, userId: targetUserId ?? undefined });
    });
  } finally {
    legacy.close();
  }
}

function databaseName(userId: string | null): string {
  return userId ? `${ACCOUNT_DATABASE_PREFIX}${userId}` : GUEST_DATABASE_NAME;
}

function getOrCreateDatabase(name: string): LiucaiDatabase {
  const existing = databases.get(name);
  if (existing) return existing;
  const database = new LiucaiDatabase(name);
  databases.set(name, database);
  return database;
}

/** Failures allowed before a mutation stops being retried in the ordinary batch. */
const MAX_SYNC_ATTEMPTS = 8;

export async function upsertPage(
  canonicalUrl: string,
  originalUrl: string,
  title: string,
  database: LiucaiDatabase = db,
): Promise<PageRecord> {
  return database.transaction("rw", database.pages, database.outbox, async () => {
    const now = new Date().toISOString();
    const existing = await database.pages.where("canonicalUrl").equals(canonicalUrl).first();

    if (existing) {
      const changedForSync = existing.originalUrl !== originalUrl || (title && existing.title !== title);
      const updated: PageRecord = {
        ...existing,
        originalUrl,
        title: title || existing.title,
        updatedAt: changedForSync ? now : existing.updatedAt,
        lastOpenedAt: now,
      };
      await database.pages.put(updated);
      if (changedForSync) {
        await enqueueSnapshot("page", updated, database);
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
    await database.pages.add(page);
    await enqueueSnapshot("page", page, database);
    return page;
  });
}

export async function getActiveHighlights(
  canonicalUrl: string,
  database: LiucaiDatabase = db,
): Promise<HighlightRecord[]> {
  const records = await database.highlights.where("canonicalUrl").equals(canonicalUrl).toArray();
  return records
    .filter((record) => !record.deletedAt)
    .map(normalizeHighlightRecord)
    .sort((a, b) => a.selector.start - b.selector.start);
}

export function normalizeHighlightRecord(record: HighlightRecord): HighlightRecord {
  return {
    ...record,
    note: typeof record.note === "string" ? record.note : "",
    tags: Array.isArray(record.tags) ? record.tags : [],
  };
}

export async function getHighlight(
  id: string,
  database: LiucaiDatabase = db,
): Promise<HighlightRecord | undefined> {
  const record = await database.highlights.get(id);
  return record ? normalizeHighlightRecord(record) : undefined;
}

export async function addHighlight(record: HighlightRecord, database: LiucaiDatabase = db): Promise<void> {
  const normalized = normalizeHighlightRecord(record);
  assertNoteWithinLimit(normalized.note);
  await database.transaction("rw", database.highlights, database.outbox, async () => {
    await database.highlights.add(normalized);
    await enqueueSnapshot("highlight", normalized, database);
  });
}

export async function putHighlight(record: HighlightRecord, database: LiucaiDatabase = db): Promise<void> {
  const normalized = normalizeHighlightRecord(record);
  assertNoteWithinLimit(normalized.note);
  await database.transaction("rw", database.highlights, database.outbox, async () => {
    await database.highlights.put(normalized);
    await enqueueSnapshot("highlight", normalized, database);
  });
}

/**
 * Pending mutations that are due to be sent.
 *
 * `now` is compared as a timestamp rather than as text. An ISO string for a far-future date
 * starts with "+", which sorts *before* every ordinary date, so the text comparison silently
 * inverted the "ignore the backoff" call that passes one.
 * Mutations that keep failing are left out of the batch so one bad record cannot freeze the queue
 * for everything behind it; `resetOutboxRetries` (the user-visible "sync now") puts them back in.
 */
export async function getOutboxBatch(
  limit = 100,
  now = new Date(),
  database: LiucaiDatabase = db,
): Promise<OutboxMutation[]> {
  const cutoff = now.getTime();
  const records = await database.outbox.toArray();
  return records
    .filter((record) => (record.retryCount ?? 0) < MAX_SYNC_ATTEMPTS)
    .filter((record) => !record.nextAttemptAt || Date.parse(record.nextAttemptAt) <= cutoff)
    .sort((left, right) => {
      if (left.entityType !== right.entityType) return left.entityType === "page" ? -1 : 1;
      return left.createdAt.localeCompare(right.createdAt) || left.mutationId.localeCompare(right.mutationId);
    })
    .slice(0, limit);
}

export async function getOutboxCount(database: LiucaiDatabase = db): Promise<number> {
  return database.outbox.count();
}

export async function resetOutboxRetries(database: LiucaiDatabase = db): Promise<void> {
  await database.outbox.toCollection().modify((record) => {
    record.retryCount = 0;
    delete record.nextAttemptAt;
    delete record.lastError;
  });
}

export async function recordSyncFailure(
  mutationIds: string[],
  message: string,
  database: LiucaiDatabase = db,
): Promise<void> {
  const attemptedAt = Date.now();
  await database.transaction("rw", database.outbox, async () => {
    for (const mutationId of mutationIds) {
      const record = await database.outbox.get(mutationId);
      if (!record) continue;
      const retryCount = record.retryCount + 1;
      const delayMs = Math.min(30 * 60_000, 30_000 * 2 ** Math.min(retryCount - 1, 6));
      await database.outbox.update(mutationId, {
        retryCount,
        nextAttemptAt: new Date(attemptedAt + delayMs).toISOString(),
        lastError: message,
      });
    }
  });
}

export async function getSyncCursor(userId: string, database: LiucaiDatabase = db): Promise<number> {
  return (await database.syncState.get(cursorKey(userId)))?.cursor ?? 0;
}

export async function getSyncState(
  userId: string,
  database: LiucaiDatabase = db,
): Promise<SyncStateRecord | undefined> {
  return database.syncState.get(cursorKey(userId));
}

export async function bindLocalDatabaseToUser(userId: string): Promise<LiucaiDatabase> {
  const database = await activateLocalDatabase(userId);
  await database.transaction("rw", database.pages, database.highlights, database.outbox, database.syncState, async () => {
    const binding = await database.syncState.get("bound-account");
    if (binding?.userId && binding.userId !== userId) {
      throw new Error("账号本地数据库的绑定信息不一致，已停止同步。");
    }
    if (!binding) {
      await database.syncState.put({ key: "bound-account", cursor: 0, userId });
    }

    const bootstrapKey = `bootstrap:${userId}`;
    if (await database.syncState.get(bootstrapKey)) return;

    const pendingEntities = new Set(
      (await database.outbox.toArray()).map((mutation) => `${mutation.entityType}:${mutation.entityId}`),
    );
    for (const page of await database.pages.toArray()) {
      if (!pendingEntities.has(`page:${page.id}`)) await enqueueSnapshot("page", page, database);
    }
    for (const highlight of await database.highlights.toArray()) {
      if (!pendingEntities.has(`highlight:${highlight.id}`)) {
        await enqueueSnapshot("highlight", highlight, database);
      }
    }

    await database.syncState.put({ key: cursorKey(userId), cursor: 0, userId });
    await database.syncState.put({ key: bootstrapKey, cursor: 0, userId });
  });
  return database;
}

export async function applySyncBatch(
  userId: string,
  result: SyncBatchResult,
  database: LiucaiDatabase = db,
): Promise<void> {
  await database.transaction(
    "rw",
    database.pages,
    database.highlights,
    database.outbox,
    database.syncState,
    async () => {
      await database.outbox.bulkDelete(result.acknowledgedMutationIds);

      for (const change of result.changes) {
        if (await hasPendingLocalChange(change.entityType, change.entityId, change.payload, database)) continue;

        if (change.entityType === "page") {
          await applyRemotePage(change.payload as PageRecord, database);
        } else if (change.operation === "delete") {
          await applyRemoteHighlightDelete(change.entityId, change.payload as HighlightDeletePayload, database);
        } else {
          await applyRemoteHighlight(change.payload as HighlightRecord, database);
        }
      }

      await database.syncState.put({
        key: cursorKey(userId),
        cursor: result.nextCursor,
        userId,
        lastSyncedAt: new Date().toISOString(),
      });
    },
  );
}

async function hasPendingLocalChange(
  entityType: SyncEntityType,
  entityId: string,
  payload: PageRecord | HighlightRecord | HighlightDeletePayload,
  database: LiucaiDatabase,
): Promise<boolean> {
  const direct = await database.outbox
    .where("[entityType+entityId]")
    .equals([entityType, entityId])
    .count();
  if (direct > 0 || entityType !== "page") return direct > 0;

  const canonicalUrl = (payload as PageRecord).canonicalUrl;
  return database.outbox.filter((mutation) => (
    mutation.entityType === "page"
    && (mutation.payload as PageRecord).canonicalUrl === canonicalUrl
  )).count().then((count) => count > 0);
}

export async function recordSyncStateError(
  userId: string,
  message: string,
  database: LiucaiDatabase = db,
): Promise<void> {
  const current = await database.syncState.get(cursorKey(userId));
  await database.syncState.put({
    key: cursorKey(userId),
    cursor: current?.cursor ?? 0,
    userId,
    lastSyncedAt: current?.lastSyncedAt,
    lastError: message,
  });
}

async function applyRemotePage(payload: PageRecord, database: LiucaiDatabase): Promise<void> {
  const existing = await database.pages.get(payload.id);
  const canonicalMatch = await database.pages.where("canonicalUrl").equals(payload.canonicalUrl).first();
  const local = existing
    ?? (canonicalMatch && canonicalMatch.id !== payload.id ? canonicalMatch : undefined);
  const page = pickPageFields(payload, local);
  if (canonicalMatch && canonicalMatch.id !== page.id) {
    await database.highlights.where("pageId").equals(canonicalMatch.id).modify({ pageId: page.id });
    await database.pages.delete(canonicalMatch.id);
  }
  await database.pages.put(page);
}

async function applyRemoteHighlight(payload: HighlightRecord, database: LiucaiDatabase): Promise<void> {
  await database.highlights.put(normalizeHighlightRecord(pickHighlightFields(payload)));
}

async function applyRemoteHighlightDelete(
  id: string,
  payload: HighlightDeletePayload,
  database: LiucaiDatabase,
): Promise<void> {
  const existing = await database.highlights.get(id);
  if (!existing) return;
  await database.highlights.put(normalizeHighlightRecord({
    ...existing,
    deletedAt: payload.deletedAt,
  }));
}

/**
 * `createdAt` and `lastOpenedAt` are local facts: the server has no column for either, so the
 * payload's copies are echoes of `updatedAt`. Writing those over the real values lost "recently
 * opened" ordering and mixed `+00:00` in with the local `Z` format, which breaks text comparisons.
 */
function pickPageFields(payload: PageRecord, local?: PageRecord): PageRecord {
  return {
    id: payload.id,
    canonicalUrl: payload.canonicalUrl,
    originalUrl: payload.originalUrl,
    title: payload.title,
    createdAt: local?.createdAt ?? normalizeTimestamp(payload.createdAt),
    updatedAt: normalizeTimestamp(payload.updatedAt),
    lastOpenedAt: local?.lastOpenedAt ?? normalizeTimestamp(payload.lastOpenedAt ?? payload.updatedAt),
  };
}

/** One timestamp format everywhere, so ordering by string stays correct. */
function normalizeTimestamp(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
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

function assertNoteWithinLimit(note: string): void {
  if (note.length > MAX_NOTE_LENGTH) throw new Error("NOTE_TOO_LONG");
}

async function enqueueSnapshot(
  entityType: SyncEntityType,
  payload: PageRecord | HighlightRecord,
  database: LiucaiDatabase,
): Promise<void> {
  await database.outbox.add({
    mutationId: generateUuid(),
    entityType,
    entityId: payload.id,
    operation: "deletedAt" in payload && payload.deletedAt ? "delete" : "upsert",
    payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  });
}
