import assert from "node:assert/strict";
import test from "node:test";
import { isPageStatusRequest, isSetSiteDisabledRequest } from "../src/messages.ts";

test("recognizes a page status request", () => {
  assert.equal(isPageStatusRequest({ type: "LIUCAI_GET_PAGE_STATUS" }), true);
  assert.equal(isPageStatusRequest({ type: "UNKNOWN" }), false);
});

test("requires a boolean disabled value", () => {
  assert.equal(isSetSiteDisabledRequest({ type: "LIUCAI_SET_SITE_DISABLED", disabled: true }), true);
  assert.equal(isSetSiteDisabledRequest({ type: "LIUCAI_SET_SITE_DISABLED", disabled: "yes" }), false);
});
