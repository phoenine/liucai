import {
  activateLocalDatabase,
  applySyncBatch,
  bindLocalDatabaseToUser,
  getOutboxBatch,
  getOutboxCount,
  getSyncCursor,
  getSyncState,
  isActiveLocalDatabase,
  recordSyncFailure,
  recordSyncStateError,
  resetOutboxRetries,
} from "../storage/db";
import {
  AI_AUTH_STATE_STORAGE_KEY,
  LOCAL_DATABASE_SCOPE_STORAGE_KEY,
  type SyncStatus,
} from "../shared/messages";
import { getSupabaseClient } from "./supabaseClient";
import { parseSyncBatchResult, toRemoteMutations } from "./syncProtocol";

const ALARM_NAME = "liucai-sync";
/** Passed to `getOutboxBatch` as `now` to make it disregard every recorded backoff. */
const IGNORE_BACKOFF = new Date(8640000000000000);
let activeSync: Promise<void> | null = null;
/** Set when a forced sync is asked for while one is already running. */
let forceRequested = false;
let initialization: Promise<void> | null = null;
let accountTransition: Promise<unknown> = Promise.resolve();

export function initializeSync(): Promise<void> {
  // `chrome.alarms.create` replaces an alarm of the same name and restarts its countdown, and this
  // runs on every service-worker wake-up — including the ones each content-script message causes.
  // Creating unconditionally meant an active browsing session kept pushing the periodic sync away.
  void chrome.alarms.get(ALARM_NAME).then((existing) => {
    if (!existing) chrome.alarms.create(ALARM_NAME, { periodInMinutes: 5 });
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) void triggerSync().catch(() => undefined);
  });
  initialization ??= initializeLocalDatabase();
  void initialization
    .then(() => triggerSync())
    .catch(() => undefined);
  return initialization;
}

export async function initializeLocalDatabase(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    await activateLocalDatabase(null);
    await publishLocalDatabaseScope(null);
    return;
  }
  const { data } = await client.auth.getSession();
  const user = data.session?.user ?? null;
  await activateLocalDatabase(user?.id ?? null);
  await publishLocalDatabaseScope(user);
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const client = getSupabaseClient();
  if (!client) {
    return { configured: false, signedIn: false, pendingCount: await getOutboxCount(), syncing: false };
  }
  const { data, error } = await client.auth.getSession();
  const user = data.session?.user;
  const state = user ? await getSyncState(user.id) : undefined;
  return {
    configured: true,
    signedIn: Boolean(user),
    email: user?.email,
    pendingCount: await getOutboxCount(),
    syncing: activeSync !== null,
    lastSyncedAt: state?.lastSyncedAt,
    error: error?.message ?? state?.lastError,
  };
}

export function signIn(email: string, password: string): Promise<SyncStatus> {
  return serializeAccountTransition(() => performSignIn(email, password));
}

async function performSignIn(email: string, password: string): Promise<SyncStatus> {
  await settleActiveSync();
  const client = requireClient();
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("登录失败：Supabase 未返回用户信息。");
  await bindOrSignOut(data.user.id);
  await publishLocalDatabaseScope(data.user);
  await triggerSync(true);
  return getSyncStatus();
}

export function signUp(email: string, password: string): Promise<SyncStatus> {
  return serializeAccountTransition(() => performSignUp(email, password));
}

async function performSignUp(email: string, password: string): Promise<SyncStatus> {
  await settleActiveSync();
  const client = requireClient();
  const { data, error } = await client.auth.signUp({ email: email.trim(), password });
  if (error) throw new Error(error.message);
  if (data.user && data.session) {
    await bindOrSignOut(data.user.id);
    await publishLocalDatabaseScope(data.user);
    await triggerSync(true);
  }
  return getSyncStatus();
}

export function signOut(): Promise<SyncStatus> {
  return serializeAccountTransition(performSignOut);
}

async function performSignOut(): Promise<SyncStatus> {
  await settleActiveSync();
  const client = requireClient();
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw new Error(error.message);
  await activateLocalDatabase(null);
  await publishLocalDatabaseScope(null);
  return getSyncStatus();
}

export async function retrySync(): Promise<SyncStatus> {
  await resetOutboxRetries();
  await triggerSync(true);
  return getSyncStatus();
}

export function triggerSync(force = false): Promise<void> {
  if (activeSync) {
    // The in-flight run has already taken its batch, so a forced request arriving now would do
    // nothing at all — remember it and serve it with one more run when this one finishes.
    if (force) forceRequested = true;
    return activeSync;
  }
  activeSync = (async () => {
    try {
      await runSync(force);
      while (forceRequested) {
        forceRequested = false;
        await runSync(true);
      }
    } finally {
      activeSync = null;
      forceRequested = false;
    }
  })();
  return activeSync;
}

async function runSync(force: boolean): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const { data, error: sessionError } = await client.auth.getSession();
  const user = data.session?.user;
  if (sessionError || !user) return;

  const database = await bindLocalDatabaseToUser(user.id);
  let lastBatchIds: string[] = [];
  try {
    for (let round = 0; round < 20; round += 1) {
      if (!isActiveLocalDatabase(database, user.id)) return;
      const batch = await getOutboxBatch(100, force ? IGNORE_BACKOFF : new Date(), database);
      lastBatchIds = batch.map((mutation) => mutation.mutationId);
      const cursor = await getSyncCursor(user.id, database);
      const { data: response, error } = await client.rpc("apply_sync_batch", {
        p_mutations: toRemoteMutations(batch),
        p_after_sequence: cursor,
        p_batch_limit: 500,
      });
      if (error) throw new Error(error.message);

      const result = parseSyncBatchResult(response);
      if (!isActiveLocalDatabase(database, user.id)) return;
      await applySyncBatch(user.id, result, database);
      if (result.changes.length > 0) {
        await chrome.storage.local.set({ "liucai.sync.changedAt": Date.now() });
      }
      if (!result.hasMore && batch.length === 0) return;
    }
    // The round cap bounds a single wake-up. Work is still pending, so schedule a prompt follow-up
    // rather than stalling quietly until the next regular interval.
    chrome.alarms.create(ALARM_NAME, { when: Date.now() + 1_000, periodInMinutes: 5 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (lastBatchIds.length > 0) await recordSyncFailure(lastBatchIds, message, database);
    await recordSyncStateError(user.id, message, database);
    throw error;
  }
}

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new Error("尚未配置 Supabase URL 和 publishable key。");
  return client;
}

async function bindOrSignOut(userId: string): Promise<void> {
  try {
    await bindLocalDatabaseToUser(userId);
  } catch (error) {
    await requireClient().auth.signOut({ scope: "local" });
    await activateLocalDatabase(null);
    await publishLocalDatabaseScope(null);
    throw error;
  }
}

async function settleActiveSync(): Promise<void> {
  if (!activeSync) return;
  try {
    await activeSync;
  } catch {
    // A failed sync must not prevent the user from changing accounts.
  }
}

function serializeAccountTransition<T>(operation: () => Promise<T>): Promise<T> {
  const result = accountTransition.then(operation, operation);
  accountTransition = result.then(() => undefined, () => undefined);
  return result;
}

async function publishLocalDatabaseScope(user: { id: string } | null): Promise<void> {
  await chrome.storage.local.set({
    [AI_AUTH_STATE_STORAGE_KEY]: Boolean(user),
    [LOCAL_DATABASE_SCOPE_STORAGE_KEY]: user ? `account:${user.id}` : "guest",
  });
}
