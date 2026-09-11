import {
  addHighlight,
  getActiveHighlights,
  getHighlight,
  importLegacyRecords,
  putHighlight,
  upsertPage,
} from "./db";
import {
  AI_AUTH_STATE_STORAGE_KEY,
  isAiExampleRequest,
  isAiExplainRequest,
  isAiTestConnectionRequest,
  isStorageRequest,
  isSyncRequest,
  type StorageRequest,
  type StorageResponse,
  type AiExplainRequest,
  type AiExampleRequest,
  type AiTestConnectionRequest,
  type SyncRequest,
  type SyncStatus,
} from "./messages";
import {
  explainSelection,
  generateExample,
  testAiConnection,
  type AiExplanationDependencies,
} from "./aiExplanation";
import { getActiveLlmConnection, loadLlmSettings } from "./llmSettings";
import { getSyncStatus, initializeSync, retrySync, signIn, signOut, signUp, triggerSync } from "./sync";

chrome.runtime.onInstalled.addListener(() => {
  console.info("六彩已安装：当前版本使用扩展 IndexedDB 保存网页高亮和批注。");
});

initializeSync();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    sender.id !== chrome.runtime.id
    || (
      !isStorageRequest(message)
      && !isSyncRequest(message)
      && !isAiExplainRequest(message)
      && !isAiExampleRequest(message)
      && !isAiTestConnectionRequest(message)
    )
  ) {
    return undefined;
  }

  void handleRequest(message)
    .then((data) => sendResponse({ ok: true, data } satisfies StorageResponse<unknown>))
    .catch((error) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies StorageResponse<unknown>));
  return true;
});

async function handleRequest(
  request: StorageRequest | SyncRequest | AiExplainRequest | AiExampleRequest | AiTestConnectionRequest,
): Promise<unknown> {
  if (isAiTestConnectionRequest(request)) {
    await testAiConnection(request.connection);
    return { connected: true };
  }
  if (isAiExampleRequest(request)) {
    return generateExample(request, getAiDependencies());
  }
  if (isAiExplainRequest(request)) {
    return explainSelection(request, getAiDependencies());
  }
  if (isSyncRequest(request)) {
    const status = await handleSyncRequest(request);
    if (
      request.type === "LIUCAI_SYNC_SIGN_IN"
      || request.type === "LIUCAI_SYNC_SIGN_UP"
      || request.type === "LIUCAI_SYNC_SIGN_OUT"
    ) {
      await chrome.storage.local.set({
        [AI_AUTH_STATE_STORAGE_KEY]: status.signedIn,
      });
    }
    return status;
  }
  const result = await handleStorageRequest(request);
  if (isMutationRequest(request)) void triggerSync().catch(() => undefined);
  return result;
}

function getAiDependencies(): AiExplanationDependencies {
  return {
    fetch: globalThis.fetch.bind(globalThis),
    getSyncStatus,
    getConnection: async () => getActiveLlmConnection(await loadLlmSettings()),
  };
}

async function handleStorageRequest(request: StorageRequest): Promise<unknown> {
  switch (request.type) {
    case "LIUCAI_STORAGE_UPSERT_PAGE":
      return upsertPage(request.canonicalUrl, request.originalUrl, request.title);
    case "LIUCAI_STORAGE_GET_ACTIVE_HIGHLIGHTS":
      return getActiveHighlights(request.canonicalUrl);
    case "LIUCAI_STORAGE_GET_HIGHLIGHT":
      return getHighlight(request.id);
    case "LIUCAI_STORAGE_ADD_HIGHLIGHT":
      return addHighlight(request.record);
    case "LIUCAI_STORAGE_PUT_HIGHLIGHT":
      return putHighlight(request.record);
    case "LIUCAI_STORAGE_IMPORT_LEGACY":
      return importLegacyRecords(request.pages, request.highlights);
  }
}

async function handleSyncRequest(request: SyncRequest): Promise<SyncStatus> {
  switch (request.type) {
    case "LIUCAI_SYNC_GET_STATUS":
      return getSyncStatus();
    case "LIUCAI_SYNC_SIGN_IN":
      return signIn(request.email, request.password);
    case "LIUCAI_SYNC_SIGN_UP":
      return signUp(request.email, request.password);
    case "LIUCAI_SYNC_SIGN_OUT":
      return signOut();
    case "LIUCAI_SYNC_RETRY":
      return retrySync();
  }
}

function isMutationRequest(request: StorageRequest): boolean {
  return request.type !== "LIUCAI_STORAGE_GET_ACTIVE_HIGHLIGHTS"
    && request.type !== "LIUCAI_STORAGE_GET_HIGHLIGHT";
}
