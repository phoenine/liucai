import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeUrl, createPageIdentity, hasPageIdentityChanged } from "../src/url.ts";

test("removes tracking parameters but preserves from", () => {
  assert.equal(
    canonicalizeUrl("https://example.com/a?utm_source=x&from=2025"),
    "https://example.com/a?from=2025",
  );
});

test("removes document anchors and preserves hash routes", () => {
  assert.equal(canonicalizeUrl("https://example.com/a#install"), "https://example.com/a");
  assert.equal(canonicalizeUrl("https://example.com/#/docs/1"), "https://example.com/#/docs/1");
  assert.equal(canonicalizeUrl("https://example.com/#!/docs/1"), "https://example.com/#!/docs/1");
});

test("compares canonical page identity instead of raw href", () => {
  const page = createPageIdentity("https://example.com/a#one");

  assert.equal(hasPageIdentityChanged(page, "https://example.com/a#two"), false);
  assert.equal(hasPageIdentityChanged(page, "https://example.com/#/two"), true);
});
