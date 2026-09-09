export type HighlightColor = "gold" | "mint" | "coral";

export interface PageRecord {
  id: string;
  canonicalUrl: string;
  originalUrl: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
}

export interface HighlightSelector {
  exact: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
}

export interface HighlightRecord {
  id: string;
  pageId: string;
  canonicalUrl: string;
  text: string;
  color: HighlightColor;
  note: string;
  tags: string[];
  selector: HighlightSelector;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export type SyncEntityType = "page" | "highlight";
export type SyncOperation = "upsert" | "delete";

export interface OutboxMutation {
  mutationId: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  payload: PageRecord | HighlightRecord;
  createdAt: string;
  retryCount: number;
  nextAttemptAt?: string;
  lastError?: string;
}

export interface SyncStateRecord {
  key: string;
  cursor: number;
  userId?: string;
  lastSyncedAt?: string;
  lastError?: string;
}

export interface RemoteChange {
  sequence: number;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  revision: number;
  payload: PageRecord | HighlightRecord;
}

export interface SyncBatchResult {
  acknowledgedMutationIds: string[];
  changes: RemoteChange[];
  nextCursor: number;
  hasMore: boolean;
}
