import assert from "node:assert/strict";
import test from "node:test";
import { parseSyncBatchResult, toRemoteMutations } from "../src/syncProtocol.ts";
import type { OutboxMutation } from "../src/types.ts";

test("serializes only the mutation contract sent to Supabase", () => {
  const mutation: OutboxMutation = {
    mutationId: "mutation-1",
    entityType: "page",
    entityId: "page-1",
    operation: "upsert",
    payload: {
      id: "page-1",
      canonicalUrl: "https://example.com",
      originalUrl: "https://example.com",
      title: "Example",
      createdAt: "2026-09-09T00:00:00Z",
      updatedAt: "2026-09-09T00:00:00Z",
      lastOpenedAt: "2026-09-09T00:00:00Z",
    },
    createdAt: "2026-09-09T00:00:00Z",
    retryCount: 3,
    lastError: "offline",
  };

  assert.deepEqual(toRemoteMutations([mutation]), [{
    mutationId: "mutation-1",
    entityType: "page",
    entityId: "page-1",
    operation: "upsert",
    payload: mutation.payload,
  }]);
});

test("parses a valid server batch and supplies page lastOpenedAt", () => {
  const result = parseSyncBatchResult({
    acknowledgedMutationIds: ["mutation-1"],
    changes: [{
      sequence: 4,
      revision: 4,
      entityType: "page",
      entityId: "page-1",
      operation: "upsert",
      payload: {
        id: "page-1",
        canonicalUrl: "https://example.com",
        originalUrl: "https://example.com",
        title: "Example",
        createdAt: "2026-09-09T00:00:00Z",
        updatedAt: "2026-09-09T01:00:00Z",
        deletedAt: null,
        revision: 4,
      },
    }],
    nextCursor: 4,
    hasMore: false,
  });

  assert.equal(result.nextCursor, 4);
  assert.equal(result.changes[0].payload.lastOpenedAt, "2026-09-09T01:00:00Z");
});

test("rejects malformed remote records before they reach IndexedDB", () => {
  assert.throws(() => parseSyncBatchResult({
    acknowledgedMutationIds: [],
    changes: [{
      sequence: 1,
      revision: 1,
      entityType: "highlight",
      entityId: "highlight-1",
      operation: "upsert",
      payload: { color: "blue" },
    }],
    nextCursor: 1,
    hasMore: false,
  }), /无效的高亮记录/);
});

test("accepts a minimal highlight deletion payload", () => {
  const result = parseSyncBatchResult({
    acknowledgedMutationIds: ["mutation-2"],
    changes: [{
      sequence: 5,
      revision: 5,
      entityType: "highlight",
      entityId: "highlight-1",
      operation: "delete",
      payload: {
        id: "highlight-1",
        deletedAt: "2026-09-11T00:00:00Z",
      },
    }],
    nextCursor: 5,
    hasMore: false,
  });

  assert.deepEqual(result.changes[0].payload, {
    id: "highlight-1",
    deletedAt: "2026-09-11T00:00:00Z",
  });
});

test("rejects the unsupported page deletion operation", () => {
  assert.throws(() => parseSyncBatchResult({
    acknowledgedMutationIds: [],
    changes: [{
      sequence: 6,
      revision: 6,
      entityType: "page",
      entityId: "page-1",
      operation: "delete",
      payload: {
        id: "page-1",
        canonicalUrl: "https://example.com",
        originalUrl: "https://example.com",
        title: "Example",
        createdAt: "2026-09-09T00:00:00Z",
        updatedAt: "2026-09-09T01:00:00Z",
      },
    }],
    nextCursor: 6,
    hasMore: false,
  }), /无效的变更记录/);
});
