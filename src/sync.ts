import {
  applySyncBatch,
  bindLocalDatabaseToUser,
  getOutboxBatch,
  getOutboxCount,
  getSyncCursor,
  getSyncState,
  recordSyncFailure,
  recordSyncStateError,
  resetOutboxRetries,
} from "./db";
import type { SyncStatus } from "./messages";
import { getSupabaseClient } from "./supabaseClient";
import { parseSyncBatchResult, toRemoteMutations } from "./syncProtocol";

const ALARM_NAME = "liucai-sync";
let activeSync: Promise<void> | null = null;

export function initializeSync(): void {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 5 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) void triggerSync().catch(() => undefined);
  });
  void triggerSync().catch(() => undefined);
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

export async function signIn(email: string, password: string): Promise<SyncStatus> {
  const client = requireClient();
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("登录失败：Supabase 未返回用户信息。");
  await bindOrSignOut(data.user.id);
  await triggerSync(true);
  return getSyncStatus();
}

export async function signUp(email: string, password: string): Promise<SyncStatus> {
  const client = requireClient();
  const { data, error } = await client.auth.signUp({ email: email.trim(), password });
  if (error) throw new Error(error.message);
  if (data.user && data.session) {
    await bindOrSignOut(data.user.id);
    await triggerSync(true);
  }
  return getSyncStatus();
}

export async function signOut(): Promise<SyncStatus> {
  const client = requireClient();
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw new Error(error.message);
  return getSyncStatus();
}

export async function retrySync(): Promise<SyncStatus> {
  await resetOutboxRetries();
  await triggerSync(true);
  return getSyncStatus();
}

export function triggerSync(force = false): Promise<void> {
  if (activeSync) return activeSync;
  activeSync = runSync(force).finally(() => {
    activeSync = null;
  });
  return activeSync;
}

async function runSync(force: boolean): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const { data, error: sessionError } = await client.auth.getSession();
  const user = data.session?.user;
  if (sessionError || !user) return;

  await bindLocalDatabaseToUser(user.id);
  let lastBatchIds: string[] = [];
  try {
    for (let round = 0; round < 20; round += 1) {
      const batch = await getOutboxBatch(100, force ? new Date(8640000000000000) : new Date());
      lastBatchIds = batch.map((mutation) => mutation.mutationId);
      const cursor = await getSyncCursor(user.id);
      const { data: response, error } = await client.rpc("apply_sync_batch", {
        p_mutations: toRemoteMutations(batch),
        p_after_sequence: cursor,
        p_batch_limit: 500,
      });
      if (error) throw new Error(error.message);

      const result = parseSyncBatchResult(response);
      await applySyncBatch(user.id, result);
      if (result.changes.length > 0) {
        await chrome.storage.local.set({ "liucai.sync.changedAt": Date.now() });
      }
      if (!result.hasMore && batch.length === 0) return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (lastBatchIds.length > 0) await recordSyncFailure(lastBatchIds, message);
    await recordSyncStateError(user.id, message);
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
    throw error;
  }
}
