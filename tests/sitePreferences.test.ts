import assert from "node:assert/strict";
import test from "node:test";
import {
  hostnameFromUrl,
  isHostnameDisabled,
  setHostnameDisabled,
  type SitePreferenceStorage,
} from "../src/sitePreferences.ts";

class MemoryStorage implements SitePreferenceStorage {
  private readonly data: Record<string, unknown> = {};

  async get(key: string): Promise<Record<string, unknown>> {
    return { [key]: this.data[key] };
  }

  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.data, items);
  }
}

test("extracts a normalized hostname from a page URL", () => {
  assert.equal(hostnameFromUrl("https://Docs.Example.com/path"), "docs.example.com");
  assert.equal(hostnameFromUrl("not a url"), null);
});

test("disables and restores an exact hostname", async () => {
  const storage = new MemoryStorage();

  assert.equal(await isHostnameDisabled("docs.example.com", storage), false);

  await setHostnameDisabled("docs.example.com", true, storage);
  assert.equal(await isHostnameDisabled("docs.example.com", storage), true);
  assert.equal(await isHostnameDisabled("www.example.com", storage), false);

  await setHostnameDisabled("docs.example.com", false, storage);
  assert.equal(await isHostnameDisabled("docs.example.com", storage), false);
});
