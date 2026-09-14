import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import type { HighlightRecord, OutboxMutation, PageRecord } from "../src/shared/types.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const bundle = await build({
  stdin: {
    contents: 'import "fake-indexeddb/auto"; export * from "./src/storage/db.ts";',
    resolveDir: root,
    sourcefile: "multi-account-db-test-entry.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  write: false,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`;
const storage = await import(moduleUrl) as typeof import("../src/storage/db.ts");

test("migrates the legacy database to its bound account without exposing it to guests", async () => {
  const legacy = new storage.LiucaiDatabase("liucai");
  await legacy.delete();
  await legacy.open();
  const page: PageRecord = {
    id: "legacy-page",
    canonicalUrl: "https://example.com/legacy",
    originalUrl: "https://example.com/legacy",
    title: "Legacy",
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
    lastOpenedAt: "2026-09-09T00:00:00.000Z",
  };
  const highlight: HighlightRecord = {
    id: "legacy-highlight",
    pageId: page.id,
    canonicalUrl: page.canonicalUrl,
    text: "Legacy text",
    color: "gold",
    note: "Legacy note",
    tags: ["legacy"],
    selector: { exact: "Legacy text", prefix: "", suffix: "", start: 0, end: 11 },
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
  const mutation: OutboxMutation = {
    mutationId: "legacy-mutation",
    entityType: "highlight",
    entityId: highlight.id,
    operation: "upsert",
    payload: highlight,
    createdAt: page.createdAt,
    retryCount: 0,
  };
  await legacy.pages.add(page);
  await legacy.highlights.add(highlight);
  await legacy.outbox.add(mutation);
  await legacy.syncState.put({ key: "bound-account", cursor: 0, userId: "legacy-user" });
  await legacy.syncState.put({ key: "cursor:legacy-user", cursor: 42, userId: "legacy-user" });

  const guest = await storage.activateLocalDatabase(null);
  assert.equal(await guest.pages.count(), 0);

  const account = await storage.activateLocalDatabase("legacy-user");
  assert.equal((await account.pages.get(page.id))?.title, "Legacy");
  assert.equal((await account.highlights.get(highlight.id))?.note, "Legacy note");
  assert.equal((await account.outbox.get(mutation.mutationId))?.entityId, highlight.id);
  assert.equal((await account.syncState.get("cursor:legacy-user"))?.cursor, 42);
  assert.equal((await account.syncState.get("bound-account"))?.userId, "legacy-user");
  assert.equal(storage.isActiveLocalDatabase(account, "legacy-user"), true);

  assert.equal(await legacy.pages.count(), 1, "the recoverable legacy source is preserved");
  await account.delete();
  await guest.delete();
  await legacy.delete();
});
