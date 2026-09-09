import type { StorageRequest, StorageResponse } from "./messages";
import type { HighlightRecord, PageRecord } from "./types";

async function sendStorageRequest<T>(request: StorageRequest): Promise<T> {
  const response = await chrome.runtime.sendMessage(request) as StorageResponse<T> | undefined;
  if (!response?.ok) {
    throw new Error(response?.error ?? "六彩本地存储服务没有响应。");
  }
  return response.data;
}

export function upsertPage(
  canonicalUrl: string,
  originalUrl: string,
  title: string,
): Promise<PageRecord> {
  return sendStorageRequest({
    type: "LIUCAI_STORAGE_UPSERT_PAGE",
    canonicalUrl,
    originalUrl,
    title,
  });
}

export function getActiveHighlights(canonicalUrl: string): Promise<HighlightRecord[]> {
  return sendStorageRequest({ type: "LIUCAI_STORAGE_GET_ACTIVE_HIGHLIGHTS", canonicalUrl });
}

export function getHighlight(id: string): Promise<HighlightRecord | undefined> {
  return sendStorageRequest({ type: "LIUCAI_STORAGE_GET_HIGHLIGHT", id });
}

export function addHighlight(record: HighlightRecord): Promise<void> {
  return sendStorageRequest({ type: "LIUCAI_STORAGE_ADD_HIGHLIGHT", record });
}

export function putHighlight(record: HighlightRecord): Promise<void> {
  return sendStorageRequest({ type: "LIUCAI_STORAGE_PUT_HIGHLIGHT", record });
}

export function importLegacyRecords(
  pages: PageRecord[],
  highlights: HighlightRecord[],
): Promise<void> {
  return sendStorageRequest({
    type: "LIUCAI_STORAGE_IMPORT_LEGACY",
    pages,
    highlights,
  });
}
