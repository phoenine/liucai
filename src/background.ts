import {
  addHighlight,
  getActiveHighlights,
  getHighlight,
  getHighlightLibrary,
  putHighlight,
  upsertPage,
} from "./storage/db";
import {
  isAiCancelRequest,
  isAiExampleRequest,
  isAiExplainRequest,
  isAiTestConnectionRequest,
  isStorageRequest,
  isSyncRequest,
  type StorageRequest,
  type StorageResponse,
  type AiCancelRequest,
  type AiExplainRequest,
  type AiExampleRequest,
  type AiTestConnectionRequest,
  type SyncRequest,
  type SyncStatus,
} from "./shared/messages";
import {
  explainSelection,
  generateExample,
  testAiConnection,
  type AiExplanationDependencies,
} from "./ai/aiExplanation";
import { AiRequestRegistry } from "./ai/aiRequestRegistry";
import { getActiveLlmConnection, loadLlmSettings } from "./settings/llmSettings";
import { getSyncStatus, initializeSync, retrySync, signIn, signOut, signUp, triggerSync } from "./sync/sync";

chrome.runtime.onInstalled.addListener(() => {
  console.info("六彩已安装：当前版本使用扩展 IndexedDB 保存网页高亮和批注。");
});

const localDatabaseReady = initializeSync();

/** At most one visible model request per tab/document, without cross-tab cancellation. */
const aiRequests = new AiRequestRegistry();

// IndexedDB is best-effort: under storage pressure the browser may evict it, taking every saved
// highlight with it. Ask for a persistent grant, backed by the `unlimitedStorage` permission.
if (navigator.storage?.persist) {
  void navigator.storage.persist().catch(() => undefined);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    sender.id !== chrome.runtime.id
    || (
      !isStorageRequest(message)
      && !isSyncRequest(message)
      && !isAiExplainRequest(message)
      && !isAiExampleRequest(message)
      && !isAiTestConnectionRequest(message)
      && !isAiCancelRequest(message)
    )
  ) {
    return undefined;
  }

  void handleRequest(message, sender)
    .then((data) => sendResponse({ ok: true, data } satisfies StorageResponse<unknown>))
    .catch((error) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies StorageResponse<unknown>));
  return true;
});

async function handleRequest(
  request: StorageRequest | SyncRequest | AiExplainRequest | AiExampleRequest | AiTestConnectionRequest | AiCancelRequest,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  await localDatabaseReady;
  if (isAiCancelRequest(request)) {
    const contextKey = aiContextKey(sender);
    aiRequests.cancel(contextKey, request.requestId);
    return { cancelled: true };
  }
  if (isAiTestConnectionRequest(request)) {
    await testAiConnection(request.connection);
    return { connected: true };
  }
  if (isAiExampleRequest(request) || isAiExplainRequest(request)) {
    const contextKey = aiContextKey(sender);
    const abort = aiRequests.begin(contextKey, request.requestId);
    const progress = createAiProgressSender(sender, request.requestId);
    try {
      return isAiExampleRequest(request)
        ? await generateExample(request, getAiDependencies(), abort.signal, progress.send)
        : await explainSelection(request, getAiDependencies(), abort.signal, progress.send);
    } finally {
      await progress.flush();
      aiRequests.finish(contextKey, request.requestId, abort);
    }
  }
  if (isSyncRequest(request)) {
    return handleSyncRequest(request);
  }
  const result = await handleStorageRequest(request);
  if (isMutationRequest(request)) void triggerSync().catch(() => undefined);
  return result;
}

function createAiProgressSender(
  sender: chrome.runtime.MessageSender,
  requestId: string,
): { send: (text: string) => void; flush: () => Promise<void> } {
  const tabId = sender.tab?.id;
  if (typeof tabId !== "number") {
    return { send: () => undefined, flush: async () => undefined };
  }

  let pending: Promise<void> = Promise.resolve();
  const options = typeof sender.frameId === "number" ? { frameId: sender.frameId } : undefined;
  return {
    send: (text) => {
      pending = pending.then(async () => {
        const update = { type: "LIUCAI_AI_STREAM_UPDATE", requestId, text } as const;
        if (options) await chrome.tabs.sendMessage(tabId, update, options);
        else await chrome.tabs.sendMessage(tabId, update);
      }).catch(() => undefined);
    },
    flush: () => pending,
  };
}

function aiContextKey(sender: chrome.runtime.MessageSender): string {
  if (typeof sender.tab?.id === "number") return `tab:${sender.tab.id}`;
  return `document:${sender.documentId ?? sender.url ?? "extension"}`;
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
    case "LIUCAI_STORAGE_GET_HIGHLIGHT_LIBRARY":
      return getHighlightLibrary();
    case "LIUCAI_STORAGE_GET_HIGHLIGHT":
      return getHighlight(request.id);
    case "LIUCAI_STORAGE_ADD_HIGHLIGHT":
      return addHighlight(request.record);
    case "LIUCAI_STORAGE_PUT_HIGHLIGHT":
      return putHighlight(request.record);
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
