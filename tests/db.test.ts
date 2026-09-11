import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import type { HighlightRecord, PageRecord } from "../src/types.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const bundle = await build({
  stdin: {
    contents: 'import "fake-indexeddb/auto"; export * from "./src/db.ts";',
    resolveDir: root,
    sourcefile: "db-test-entry.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  write: false,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`;
const storage = await import(moduleUrl) as typeof import("../src/db.ts");

test.beforeEach(async () => {
  await storage.db.delete();
  await storage.db.open();
});

test.after(async () => {
  await storage.db.delete();
});

test("stores pages once and queues only sync-relevant changes", async () => {
  const first = await storage.upsertPage(
    "https://example.com/article",
    "https://example.com/article",
    "Example",
  );
  const reopened = await storage.upsertPage(
    "https://example.com/article",
    "https://example.com/article",
    "Example",
  );

  assert.equal(reopened.id, first.id);
  assert.equal(await storage.db.pages.count(), 1);
  assert.equal(await storage.db.outbox.count(), 1);
});

test("serializes concurrent page creation for the same canonical URL", async () => {
  const pages = await Promise.all(Array.from({ length: 4 }, () => storage.upsertPage(
    "https://example.com/concurrent",
    "https://example.com/concurrent",
    "Concurrent",
  )));

  assert.equal(new Set(pages.map((page) => page.id)).size, 1);
  assert.equal(await storage.db.pages.count(), 1);
  assert.equal(await storage.db.outbox.count(), 1);
});

test("writes highlight snapshots and tombstones to the outbox", async () => {
  const page = await storage.upsertPage(
    "https://example.com/article",
    "https://example.com/article",
    "Example",
  );
  await storage.db.outbox.clear();

  const highlight = createHighlight(page.id);
  await storage.addHighlight(highlight);
  await storage.putHighlight({
    ...highlight,
    deletedAt: "2026-09-09T00:01:00.000Z",
    updatedAt: "2026-09-09T00:01:00.000Z",
  });

  const mutations = await storage.db.outbox.toArray();
  assert.equal(mutations.length, 2);
  assert.deepEqual(mutations.map((mutation) => mutation.operation).sort(), ["delete", "upsert"]);
  assert.equal((await storage.getHighlight(highlight.id))?.deletedAt, "2026-09-09T00:01:00.000Z");
});

test("applies acknowledged remote changes and advances the account cursor atomically", async () => {
  const localPage = await storage.upsertPage(
    "https://example.com/article",
    "https://example.com/article",
    "Local",
  );
  const mutation = await storage.db.outbox.toCollection().first();
  assert.ok(mutation);

  const remotePage: PageRecord = {
    ...localPage,
    title: "Server",
    updatedAt: "2026-09-09T01:00:00.000Z",
    lastOpenedAt: "2026-09-09T01:00:00.000Z",
  };
  await storage.applySyncBatch("user-a", {
    acknowledgedMutationIds: [mutation.mutationId],
    changes: [{
      sequence: 7,
      revision: 7,
      entityType: "page",
      entityId: remotePage.id,
      operation: "upsert",
      payload: remotePage,
    }],
    nextCursor: 7,
    hasMore: false,
  });

  assert.equal(await storage.db.outbox.count(), 0);
  assert.equal((await storage.db.pages.get(remotePage.id))?.title, "Server");
  assert.equal(await storage.getSyncCursor("user-a"), 7);
});

test("applies a minimal remote highlight deletion without recreating missing content", async () => {
  const page = await storage.upsertPage(
    "https://example.com/article",
    "https://example.com/article",
    "Example",
  );
  const highlight = createHighlight(page.id);
  await storage.addHighlight(highlight);
  await storage.db.outbox.clear();

  await storage.applySyncBatch("user-a", {
    acknowledgedMutationIds: [],
    changes: [{
      sequence: 8,
      revision: 8,
      entityType: "highlight",
      entityId: highlight.id,
      operation: "delete",
      payload: {
        id: highlight.id,
        deletedAt: "2026-09-11T00:00:00.000Z",
      },
    }],
    nextCursor: 8,
    hasMore: false,
  });

  assert.equal((await storage.getHighlight(highlight.id))?.deletedAt, "2026-09-11T00:00:00.000Z");

  await storage.applySyncBatch("user-b", {
    acknowledgedMutationIds: [],
    changes: [{
      sequence: 9,
      revision: 9,
      entityType: "highlight",
      entityId: "unknown-highlight",
      operation: "delete",
      payload: {
        id: "unknown-highlight",
        deletedAt: "2026-09-11T00:01:00.000Z",
      },
    }],
    nextCursor: 9,
    hasMore: false,
  });

  assert.equal(await storage.getHighlight("unknown-highlight"), undefined);
});

test("does not overwrite an entity that still has a pending local mutation", async () => {
  const page = await storage.upsertPage(
    "https://example.com/article",
    "https://example.com/article",
    "Local pending",
  );
  await storage.applySyncBatch("user-a", {
    acknowledgedMutationIds: [],
    changes: [{
      sequence: 3,
      revision: 3,
      entityType: "page",
      entityId: page.id,
      operation: "upsert",
      payload: { ...page, title: "Older remote" },
    }],
    nextCursor: 3,
    hasMore: false,
  });

  assert.equal((await storage.db.pages.get(page.id))?.title, "Local pending");
  assert.equal(await storage.getSyncCursor("user-a"), 3);
});

test("preserves a pending local page when the server canonical page has another id", async () => {
  const page = await storage.upsertPage(
    "https://example.com/article",
    "https://example.com/article",
    "Local pending",
  );
  await storage.applySyncBatch("user-a", {
    acknowledgedMutationIds: [],
    changes: [{
      sequence: 4,
      revision: 4,
      entityType: "page",
      entityId: "server-page-id",
      operation: "upsert",
      payload: { ...page, id: "server-page-id", title: "Remote" },
    }],
    nextCursor: 4,
    hasMore: false,
  });

  assert.equal((await storage.db.pages.get(page.id))?.title, "Local pending");
  assert.equal(await storage.db.pages.get("server-page-id"), undefined);
});

test("binds a local database to one cloud account", async () => {
  await storage.bindLocalDatabaseToUser("user-a");
  await storage.bindLocalDatabaseToUser("user-a");
  await assert.rejects(
    storage.bindLocalDatabaseToUser("user-b"),
    /已绑定其他账号/,
  );
});

test("first account binding queues a complete page-first bootstrap exactly once", async () => {
  const page = await storage.upsertPage(
    "https://example.com/article",
    "https://example.com/article",
    "Historical page",
  );
  const highlight = createHighlight(page.id);
  await storage.addHighlight(highlight);

  await storage.db.outbox.clear();
  await storage.putHighlight(highlight);

  await storage.bindLocalDatabaseToUser("user-a");

  const firstBatch = await storage.getOutboxBatch();
  assert.deepEqual(firstBatch.map((mutation) => mutation.entityType), ["page", "highlight"]);
  assert.equal(firstBatch.filter((mutation) => mutation.entityId === page.id).length, 1);
  assert.equal(firstBatch.filter((mutation) => mutation.entityId === highlight.id).length, 1);
  assert.equal(await storage.getSyncCursor("user-a"), 0);

  await storage.bindLocalDatabaseToUser("user-a");
  assert.equal(await storage.db.outbox.count(), 2);
});

test("ignores the recorded backoff when handed a far-future now", async () => {
  await storage.upsertPage(
    "https://example.com/backoff",
    "https://example.com/backoff",
    "Backoff",
  );
  const [pending] = await storage.getOutboxBatch();
  await storage.recordSyncFailure([pending.mutationId], "server rejected the batch");

  // While the backoff runs, an ordinary read must hold the record back...
  assert.equal((await storage.getOutboxBatch(100, new Date())).length, 0);
  // ...but a far-future "now" is how the sync loop asks for "ignore the backoff". Comparing that
  // date as text used to sort it before every real date and hide the record instead of unearthing it.
  assert.equal((await storage.getOutboxBatch(100, new Date(8640000000000000))).length, 1);
});

test("keeps queued payloads byte-for-byte aligned with local records", async () => {
  const longUrl = `https://example.com/${"a".repeat(9000)}`;
  const page = await storage.upsertPage(longUrl, longUrl, "t".repeat(5000));
  const [mutation] = await storage.getOutboxBatch();
  const payload = mutation.payload as PageRecord;

  assert.equal(payload.canonicalUrl, page.canonicalUrl);
  assert.equal(payload.originalUrl, page.originalUrl);
  assert.equal(payload.title, page.title);
});

test("rejects an oversized note instead of silently truncating it", async () => {
  const page = await storage.upsertPage(
    "https://example.com/article",
    "https://example.com/article",
    "Example",
  );
  await assert.rejects(
    storage.addHighlight({ ...createHighlight(page.id), note: "字".repeat(1_048_577) }),
    /NOTE_TOO_LONG/,
  );
  assert.equal(await storage.db.highlights.count(), 0);
  assert.equal((await storage.db.outbox.toArray()).filter((item) => item.entityType === "highlight").length, 0);
});

test("stops retrying a mutation that keeps failing so it cannot freeze the queue", async () => {
  await storage.upsertPage("https://example.com/stuck", "https://example.com/stuck", "Stuck");
  const [pending] = await storage.getOutboxBatch();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await storage.recordSyncFailure([pending.mutationId], "server said no");
  }

  // Still queued locally, but no longer dragging everything behind it down.
  assert.equal(await storage.db.outbox.count(), 1);
  assert.equal((await storage.getOutboxBatch(100, new Date(8640000000000000))).length, 0);

  // "Sync now" puts it back in.
  await storage.resetOutboxRetries();
  assert.equal((await storage.getOutboxBatch(100, new Date(8640000000000000))).length, 1);
});

test("fills in a missing note so consumers can trim it", async () => {
  // A record stored before `note` existed; every consumer calls note.trim() on it.
  await storage.db.highlights.add({
    id: "legacy-record",
    pageId: "page-1",
    canonicalUrl: "https://example.com/article",
    text: "Selected text",
    color: "gold",
    note: undefined as unknown as string,
    tags: undefined as unknown as string[],
    selector: { exact: "Selected text", prefix: "", suffix: "", start: 0, end: 13 },
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
  });

  const loaded = await storage.getHighlight("legacy-record");

  assert.equal(loaded?.note, "");
  assert.deepEqual(loaded?.tags, []);
});

test("keeps local page timestamps when applying a remote change", async () => {
  const page = await storage.upsertPage(
    "https://example.com/keep",
    "https://example.com/keep",
    "Keep",
  );
  const local = await storage.db.pages.get(page.id);
  // Clear the outbox so the incoming change is not skipped as a pending local edit.
  await storage.db.outbox.clear();
  const remote = "2026-09-11T00:00:00+00:00";

  await storage.applySyncBatch("user-a", {
    acknowledgedMutationIds: [],
    changes: [{
      sequence: 1,
      entityType: "page",
      entityId: page.id,
      operation: "upsert",
      revision: 1,
      payload: {
        ...page,
        title: "Renamed",
        createdAt: remote,
        updatedAt: remote,
        lastOpenedAt: remote,
      },
    }],
    nextCursor: 1,
    hasMore: false,
  });

  const after = await storage.db.pages.get(page.id);

  assert.equal(after?.title, "Renamed");
  // The server has no column for these two, so its echoes of updatedAt must not overwrite them.
  assert.equal(after?.lastOpenedAt, local?.lastOpenedAt);
  assert.equal(after?.createdAt, local?.createdAt);
  // And timestamps are normalised, so ordering by string keeps working.
  assert.match(String(after?.updatedAt), /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
});

function createHighlight(pageId: string): HighlightRecord {
  return {
    id: "highlight-1",
    pageId,
    canonicalUrl: "https://example.com/article",
    text: "Selected text",
    color: "gold",
    note: "",
    tags: [],
    selector: {
      exact: "Selected text",
      prefix: "",
      suffix: "",
      start: 0,
      end: 13,
    },
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
  };
}
