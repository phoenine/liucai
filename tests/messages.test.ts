import assert from "node:assert/strict";
import test from "node:test";
import {
  isAiExplainRequest,
  isAiExampleRequest,
  isAiTestConnectionRequest,
  isPageStatusRequest,
  isSetSiteDisabledRequest,
  isStorageRequest,
  isSyncRequest,
} from "../src/messages.ts";

test("validates bounded AI explanation requests", () => {
  assert.equal(isAiExplainRequest({
    type: "LIUCAI_AI_EXPLAIN",
    selectedText: "retrieval augmented generation",
    contextText: "A nearby paragraph",
    locale: "en",
  }), true);
  assert.equal(isAiExplainRequest({
    type: "LIUCAI_AI_EXPLAIN",
    selectedText: " ",
    contextText: "context",
    locale: "zh-CN",
  }), false);
  assert.equal(isAiExplainRequest({
    type: "LIUCAI_AI_EXPLAIN",
    selectedText: "term",
    contextText: "context",
    locale: "fr",
  }), false);
});

test("validates follow-up example requests", () => {
  assert.equal(isAiExampleRequest({
    type: "LIUCAI_AI_EXAMPLE",
    selectedText: "RAG",
    contextText: "RAG is used here.",
    concept: "Retrieval augmented generation",
    locale: "en",
  }), true);
  assert.equal(isAiExampleRequest({
    type: "LIUCAI_AI_EXAMPLE",
    selectedText: "RAG",
    contextText: "context",
    concept: "",
    locale: "en",
  }), false);
});

test("validates bounded AI connection tests", () => {
  assert.equal(isAiTestConnectionRequest({
    type: "LIUCAI_AI_TEST_CONNECTION",
    connection: { baseUrl: "http://localhost:1234/v1", model: "local", apiKey: "" },
  }), true);
  assert.equal(isAiTestConnectionRequest({
    type: "LIUCAI_AI_TEST_CONNECTION",
    connection: { baseUrl: "http://localhost:1234/v1", model: "", apiKey: "" },
  }), false);
});

test("recognizes a page status request", () => {
  assert.equal(isPageStatusRequest({ type: "LIUCAI_GET_PAGE_STATUS" }), true);
  assert.equal(isPageStatusRequest({ type: "UNKNOWN" }), false);
});

test("validates sync auth requests", () => {
  assert.equal(isSyncRequest({ type: "LIUCAI_SYNC_GET_STATUS" }), true);
  assert.equal(isSyncRequest({ type: "LIUCAI_SYNC_SIGN_IN", email: "a@example.com", password: "secret" }), true);
  assert.equal(isSyncRequest({ type: "LIUCAI_SYNC_SIGN_IN", email: "a@example.com" }), false);
  assert.equal(isSyncRequest({ type: "LIUCAI_SYNC_UNKNOWN" }), false);
});

test("requires a boolean disabled value", () => {
  assert.equal(isSetSiteDisabledRequest({ type: "LIUCAI_SET_SITE_DISABLED", disabled: true }), true);
  assert.equal(isSetSiteDisabledRequest({ type: "LIUCAI_SET_SITE_DISABLED", disabled: "yes" }), false);
});

test("recognizes extension storage requests", () => {
  assert.equal(isStorageRequest({
    type: "LIUCAI_STORAGE_GET_ACTIVE_HIGHLIGHTS",
    canonicalUrl: "https://example.com/article",
  }), true);
  assert.equal(isStorageRequest({ type: "LIUCAI_GET_PAGE_STATUS" }), false);
  assert.equal(isStorageRequest(null), false);
});
