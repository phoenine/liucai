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
