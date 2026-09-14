import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("settles an in-flight sync before changing the Supabase session", async () => {
  const source = await readFile(new URL("../src/sync.ts", import.meta.url), "utf8");

  assert.match(source, /signIn[\s\S]*?serializeAccountTransition/);
  assert.match(source, /signUp[\s\S]*?serializeAccountTransition/);
  assert.match(source, /signOut[\s\S]*?serializeAccountTransition/);
  assert.match(source, /signIn[\s\S]*?await settleActiveSync\(\);[\s\S]*?signInWithPassword/);
  assert.match(source, /signUp[\s\S]*?await settleActiveSync\(\);[\s\S]*?\.auth\.signUp/);
  assert.match(source, /signOut[\s\S]*?await settleActiveSync\(\);[\s\S]*?\.auth\.signOut/);
});

test("applies a sync response only to the database captured for that account", async () => {
  const source = await readFile(new URL("../src/sync.ts", import.meta.url), "utf8");

  assert.match(source, /const database = await bindLocalDatabaseToUser\(user\.id\)/);
  assert.match(source, /if \(!isActiveLocalDatabase\(database, user\.id\)\) return;[\s\S]*?await applySyncBatch\(user\.id, result, database\)/);
  assert.match(source, /recordSyncFailure\(lastBatchIds, message, database\)/);
  assert.match(source, /recordSyncStateError\(user\.id, message, database\)/);
});

test("waits for the startup account database before serving storage requests", async () => {
  const source = await readFile(new URL("../src/background.ts", import.meta.url), "utf8");

  assert.match(source, /const localDatabaseReady = initializeSync\(\)/);
  assert.match(source, /handleRequest[\s\S]*?await localDatabaseReady;/);
});

test("notifies pages about the new database before starting that account's sync", async () => {
  const source = await readFile(new URL("../src/sync.ts", import.meta.url), "utf8");

  assert.match(source, /signIn[\s\S]*?bindOrSignOut\(data\.user\.id\)[\s\S]*?publishLocalDatabaseScope\(data\.user\)[\s\S]*?triggerSync\(true\)/);
  assert.match(source, /initializeLocalDatabase[\s\S]*?activateLocalDatabase\(user\?\.id \?\? null\)[\s\S]*?publishLocalDatabaseScope\(user\)/);
});
