import assert from "node:assert/strict";
import test from "node:test";
import {
  isPageStatusRequest,
  isSetSiteDisabledRequest,
  isStorageRequest,
  isSyncRequest,
} from "../src/messages.ts";

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
