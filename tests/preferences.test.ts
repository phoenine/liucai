import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  normalizePreferences,
  PREFERENCES_STORAGE_KEY,
  savePreferences,
  type PreferenceStorage,
} from "../src/shared/preferences.ts";

class MemoryPreferenceStorage implements PreferenceStorage {
  values: Record<string, unknown> = {};

  async get(key: string): Promise<Record<string, unknown>> {
    return key in this.values ? { [key]: this.values[key] } : {};
  }

  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.values, items);
  }
}

test("supplies a stable gold default for missing preferences", () => {
  assert.deepEqual(normalizePreferences(undefined), DEFAULT_PREFERENCES);
});

test("accepts known colors and repairs invalid preference fields", () => {
  assert.equal(normalizePreferences({ highlights: { defaultAnnotationColor: "mint" } }).highlights.defaultAnnotationColor, "mint");
  assert.equal(normalizePreferences({ highlights: { defaultAnnotationColor: "blue" } }).highlights.defaultAnnotationColor, "gold");
  assert.equal(normalizePreferences({ highlights: null }).highlights.defaultAnnotationColor, "gold");
});

test("accepts known interface languages and repairs invalid values", () => {
  assert.equal(normalizePreferences({ general: { interfaceLanguage: "en" } }).general.interfaceLanguage, "en");
  assert.equal(normalizePreferences({ general: { interfaceLanguage: "zh-CN" } }).general.interfaceLanguage, "zh-CN");
  assert.equal(normalizePreferences({ general: { interfaceLanguage: "fr" } }).general.interfaceLanguage, "auto");
});

test("round-trips normalized preferences through the storage contract", async () => {
  const storage = new MemoryPreferenceStorage();
  const saved = await savePreferences({
    version: 1,
    general: { interfaceLanguage: "en" },
    highlights: { defaultAnnotationColor: "coral" },
  }, storage);

  assert.deepEqual(storage.values[PREFERENCES_STORAGE_KEY], saved);
  assert.deepEqual(await loadPreferences(storage), saved);
});
