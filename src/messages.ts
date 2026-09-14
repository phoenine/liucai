import type { HighlightRecord } from "./types";

export const AI_AUTH_STATE_STORAGE_KEY = "liucai.ai.signedIn";

export type PageStatusRequest = { type: "LIUCAI_GET_PAGE_STATUS" };
export type SetSiteDisabledRequest = { type: "LIUCAI_SET_SITE_DISABLED"; disabled: boolean };

export type SyncRequest =
  | { type: "LIUCAI_SYNC_GET_STATUS" }
  | { type: "LIUCAI_SYNC_SIGN_IN"; email: string; password: string }
  | { type: "LIUCAI_SYNC_SIGN_UP"; email: string; password: string }
  | { type: "LIUCAI_SYNC_SIGN_OUT" }
  | { type: "LIUCAI_SYNC_RETRY" };

export interface SyncStatus {
  configured: boolean;
  signedIn: boolean;
  email?: string;
  pendingCount: number;
  syncing: boolean;
  lastSyncedAt?: string;
  error?: string;
}

export interface AiExplanation {
  concept: string;
  explanation: string;
}

export interface AiExample {
  example: string;
}

export interface AiExplainRequest {
  type: "LIUCAI_AI_EXPLAIN";
  requestId: string;
  selectedText: string;
  contextText: string;
  locale: "zh-CN" | "en";
}

export interface AiExampleRequest {
  type: "LIUCAI_AI_EXAMPLE";
  requestId: string;
  selectedText: string;
  contextText: string;
  concept: string;
  locale: "zh-CN" | "en";
}

export interface AiTestConnectionRequest {
  type: "LIUCAI_AI_TEST_CONNECTION";
  connection: {
    baseUrl: string;
    model: string;
    apiKey: string;
  };
}

export interface AiCancelRequest {
  type: "LIUCAI_AI_CANCEL";
  requestId: string;
}

export interface AiStreamUpdate {
  type: "LIUCAI_AI_STREAM_UPDATE";
  requestId: string;
  text: string;
}

export interface PageStatus {
  ok: true;
  canonicalUrl: string;
  hostname: string;
  title: string;
  highlightCount: number;
  disabled: boolean;
}

export interface PageStatusError {
  ok: false;
  error: string;
}

export type PageStatusResponse = PageStatus | PageStatusError;

export type StorageRequest =
  | {
    type: "LIUCAI_STORAGE_UPSERT_PAGE";
    canonicalUrl: string;
    originalUrl: string;
    title: string;
  }
  | { type: "LIUCAI_STORAGE_GET_ACTIVE_HIGHLIGHTS"; canonicalUrl: string }
  | { type: "LIUCAI_STORAGE_GET_HIGHLIGHT"; id: string }
  | { type: "LIUCAI_STORAGE_ADD_HIGHLIGHT"; record: HighlightRecord }
  | { type: "LIUCAI_STORAGE_PUT_HIGHLIGHT"; record: HighlightRecord };

export type StorageResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function isPageStatusRequest(message: unknown): message is PageStatusRequest {
  return typeof message === "object" && message !== null && (message as PageStatusRequest).type === "LIUCAI_GET_PAGE_STATUS";
}

export function isSetSiteDisabledRequest(message: unknown): message is SetSiteDisabledRequest {
  return (
    typeof message === "object"
    && message !== null
    && (message as SetSiteDisabledRequest).type === "LIUCAI_SET_SITE_DISABLED"
    && typeof (message as SetSiteDisabledRequest).disabled === "boolean"
  );
}

const STORAGE_MESSAGE_TYPES = new Set<StorageRequest["type"]>([
  "LIUCAI_STORAGE_UPSERT_PAGE",
  "LIUCAI_STORAGE_GET_ACTIVE_HIGHLIGHTS",
  "LIUCAI_STORAGE_GET_HIGHLIGHT",
  "LIUCAI_STORAGE_ADD_HIGHLIGHT",
  "LIUCAI_STORAGE_PUT_HIGHLIGHT",
]);

export function isStorageRequest(message: unknown): message is StorageRequest {
  if (typeof message !== "object" || message === null) {
    return false;
  }
  return STORAGE_MESSAGE_TYPES.has((message as { type?: StorageRequest["type"] }).type as StorageRequest["type"]);
}

const SYNC_MESSAGE_TYPES = new Set<SyncRequest["type"]>([
  "LIUCAI_SYNC_GET_STATUS",
  "LIUCAI_SYNC_SIGN_IN",
  "LIUCAI_SYNC_SIGN_UP",
  "LIUCAI_SYNC_SIGN_OUT",
  "LIUCAI_SYNC_RETRY",
]);

export function isSyncRequest(message: unknown): message is SyncRequest {
  if (typeof message !== "object" || message === null) return false;
  const type = (message as { type?: SyncRequest["type"] }).type;
  if (!type || !SYNC_MESSAGE_TYPES.has(type)) return false;
  if (type === "LIUCAI_SYNC_SIGN_IN" || type === "LIUCAI_SYNC_SIGN_UP") {
    const request = message as { email?: unknown; password?: unknown };
    return typeof request.email === "string" && typeof request.password === "string";
  }
  return true;
}

export function isAiExplainRequest(message: unknown): message is AiExplainRequest {
  if (typeof message !== "object" || message === null) return false;
  const request = message as Partial<AiExplainRequest>;
  return request.type === "LIUCAI_AI_EXPLAIN"
    && isRequestId(request.requestId)
    && typeof request.selectedText === "string"
    && request.selectedText.trim().length > 0
    && request.selectedText.length <= 1500
    && typeof request.contextText === "string"
    && request.contextText.length <= 2500
    && (request.locale === "zh-CN" || request.locale === "en");
}

export function isAiExampleRequest(message: unknown): message is AiExampleRequest {
  if (typeof message !== "object" || message === null) return false;
  const request = message as Partial<AiExampleRequest>;
  return request.type === "LIUCAI_AI_EXAMPLE"
    && isRequestId(request.requestId)
    && typeof request.selectedText === "string"
    && request.selectedText.trim().length > 0
    && request.selectedText.length <= 1500
    && typeof request.contextText === "string"
    && request.contextText.length <= 2500
    && typeof request.concept === "string"
    && request.concept.trim().length > 0
    && request.concept.length <= 120
    && (request.locale === "zh-CN" || request.locale === "en");
}

export function isAiCancelRequest(message: unknown): message is AiCancelRequest {
  return typeof message === "object"
    && message !== null
    && (message as AiCancelRequest).type === "LIUCAI_AI_CANCEL"
    && isRequestId((message as AiCancelRequest).requestId);
}

export function isAiStreamUpdate(message: unknown): message is AiStreamUpdate {
  if (typeof message !== "object" || message === null) return false;
  const update = message as Partial<AiStreamUpdate>;
  return update.type === "LIUCAI_AI_STREAM_UPDATE"
    && isRequestId(update.requestId)
    && typeof update.text === "string";
}

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 100;
}

export function isAiTestConnectionRequest(message: unknown): message is AiTestConnectionRequest {
  if (typeof message !== "object" || message === null) return false;
  const request = message as Partial<AiTestConnectionRequest>;
  const connection = request.connection;
  return request.type === "LIUCAI_AI_TEST_CONNECTION"
    && typeof connection === "object"
    && connection !== null
    && typeof connection.baseUrl === "string"
    && connection.baseUrl.length <= 2048
    && typeof connection.model === "string"
    && connection.model.trim().length > 0
    && connection.model.length <= 300
    && typeof connection.apiKey === "string"
    && connection.apiKey.length <= 1000;
}
