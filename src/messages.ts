import type { HighlightRecord, PageRecord } from "./types";

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
  | { type: "LIUCAI_STORAGE_PUT_HIGHLIGHT"; record: HighlightRecord }
  | {
    type: "LIUCAI_STORAGE_IMPORT_LEGACY";
    pages: PageRecord[];
    highlights: HighlightRecord[];
  };

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
  "LIUCAI_STORAGE_IMPORT_LEGACY",
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
