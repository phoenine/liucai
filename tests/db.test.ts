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

test("merges legacy pages by canonical URL and remaps highlight page IDs", async () => {
  const current = await storage.upsertPage(
    "https://example.com/article",
    "https://example.com/article",
    "Current",
  );
  await storage.db.outbox.clear();

  const legacyPage: PageRecord = {
    id: "legacy-page",
    canonicalUrl: "https://example.com/article",
    originalUrl: "https://example.com/article?from=legacy",
    title: "Legacy title",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2099-01-01T00:00:00.000Z",
    lastOpenedAt: "2099-01-01T00:00:00.000Z",
  };
  const legacyHighlight = createHighlight(legacyPage.id);

  await storage.importLegacyRecords([legacyPage], [legacyHighlight]);
  await storage.importLegacyRecords([legacyPage], [legacyHighlight]);

  const mergedPage = await storage.db.pages.where("canonicalUrl").equals(legacyPage.canonicalUrl).first();
  assert.equal(await storage.db.pages.count(), 1);
  assert.equal(mergedPage?.id, current.id);
  assert.equal(mergedPage?.title, "Legacy title");
  assert.equal((await storage.getHighlight(legacyHighlight.id))?.pageId, current.id);
  assert.equal(await storage.db.outbox.count(), 2);
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
