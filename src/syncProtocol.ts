import type {
  HighlightRecord,
  OutboxMutation,
  PageRecord,
  RemoteChange,
  SyncBatchResult,
} from "./types";

export function toRemoteMutations(mutations: OutboxMutation[]) {
  return mutations.map(({ mutationId, entityType, entityId, operation, payload }) => ({
    mutationId,
    entityType,
    entityId,
    operation,
    payload,
  }));
}

export function parseSyncBatchResult(value: unknown): SyncBatchResult {
  if (!isObject(value)) throw new Error("同步服务返回了无效响应。");
  const acknowledgedMutationIds = value.acknowledgedMutationIds;
  const changes = value.changes;
  if (!Array.isArray(acknowledgedMutationIds) || !acknowledgedMutationIds.every(isString)) {
    throw new Error("同步服务返回了无效的确认列表。");
  }
  if (!Array.isArray(changes)) throw new Error("同步服务返回了无效的变更列表。");
  if (!isNonNegativeInteger(value.nextCursor) || typeof value.hasMore !== "boolean") {
    throw new Error("同步服务返回了无效的游标。");
  }

  return {
    acknowledgedMutationIds,
    changes: changes.map(parseRemoteChange),
    nextCursor: value.nextCursor,
    hasMore: value.hasMore,
  };
}

function parseRemoteChange(value: unknown): RemoteChange {
  if (!isObject(value)
    || !isNonNegativeInteger(value.sequence)
    || !isNonNegativeInteger(value.revision)
    || !isString(value.entityId)
    || (value.entityType !== "page" && value.entityType !== "highlight")
    || (value.operation !== "upsert" && value.operation !== "delete")) {
    throw new Error("同步服务返回了无效的变更记录。");
  }

  const payload = value.entityType === "page"
    ? parsePagePayload(value.payload)
    : parseHighlightPayload(value.payload);
  return {
    sequence: value.sequence,
    entityType: value.entityType,
    entityId: value.entityId,
    operation: value.operation,
    revision: value.revision,
    payload,
  };
}

function parsePagePayload(value: unknown): PageRecord {
  if (!isObject(value)
    || !isString(value.id)
    || !isString(value.canonicalUrl)
    || !isString(value.originalUrl)
    || !isString(value.title)
    || !isString(value.createdAt)
    || !isString(value.updatedAt)) {
    throw new Error("同步服务返回了无效的页面记录。");
  }
  return {
    id: value.id,
    canonicalUrl: value.canonicalUrl,
    originalUrl: value.originalUrl,
    title: value.title,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    lastOpenedAt: isString(value.lastOpenedAt) ? value.lastOpenedAt : value.updatedAt,
  };
}

function parseHighlightPayload(value: unknown): HighlightRecord {
  if (!isObject(value)
    || !isString(value.id)
    || !isString(value.pageId)
    || !isString(value.canonicalUrl)
    || !isString(value.text)
    || (value.color !== "gold" && value.color !== "mint" && value.color !== "coral")
    || !isString(value.note)
    || !Array.isArray(value.tags)
    || !value.tags.every(isString)
    || !isSelector(value.selector)
    || !isString(value.createdAt)
    || !isString(value.updatedAt)) {
    throw new Error("同步服务返回了无效的高亮记录。");
  }
  return {
    id: value.id,
    pageId: value.pageId,
    canonicalUrl: value.canonicalUrl,
    text: value.text,
    color: value.color,
    note: value.note,
    tags: value.tags,
    selector: value.selector,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    ...(isString(value.deletedAt) ? { deletedAt: value.deletedAt } : {}),
  };
}

function isSelector(value: unknown): value is HighlightRecord["selector"] {
  return isObject(value)
    && isString(value.exact)
    && isString(value.prefix)
    && isString(value.suffix)
    && typeof value.start === "number"
    && typeof value.end === "number";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
