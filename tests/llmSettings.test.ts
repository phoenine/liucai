import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_LLM_SETTINGS,
  isLlmSettingsComplete,
  getActiveLlmConnection,
  LLM_SETTINGS_STORAGE_KEY,
  loadLlmSettings,
  normalizeLlmSettings,
  OPENAI_BASE_URL,
  saveLlmSettings,
} from "../src/llmSettings.ts";
import { PREFERENCES_STORAGE_KEY } from "../src/preferences.ts";

class MemoryStorage {
  values: Record<string, unknown> = {};

  async get(key: string): Promise<Record<string, unknown>> {
    return key in this.values ? { [key]: this.values[key] } : {};
  }

  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.values, items);
  }
}

test("defaults to the documented local LM Studio endpoint", () => {
  assert.deepEqual(normalizeLlmSettings(undefined), DEFAULT_LLM_SETTINGS);
  assert.equal(DEFAULT_LLM_SETTINGS.provider, "lm-studio");
  assert.equal(DEFAULT_LLM_SETTINGS.lmStudio.baseUrl, "http://localhost:1234/v1");
  assert.equal(OPENAI_BASE_URL, "https://api.openai.com/v1");
});

test("requires the fields needed by each direct connection", () => {
  assert.equal(isLlmSettingsComplete(DEFAULT_LLM_SETTINGS), false);
  assert.equal(isLlmSettingsComplete({
    ...DEFAULT_LLM_SETTINGS,
    lmStudio: { ...DEFAULT_LLM_SETTINGS.lmStudio, model: "local-model" },
  }), true);
  assert.equal(isLlmSettingsComplete({
    ...DEFAULT_LLM_SETTINGS,
    provider: "openai",
    openai: { model: "online-model", apiKey: "sk-test" },
  }), true);
});

test("stores LLM credentials separately from ordinary preferences", async () => {
  const storage = new MemoryStorage();
  const settings = {
    ...DEFAULT_LLM_SETTINGS,
    provider: "openai" as const,
    openai: { model: "online-model", apiKey: "sk-local-only" },
  };

  await saveLlmSettings(settings, storage);

  assert.notEqual(LLM_SETTINGS_STORAGE_KEY, PREFERENCES_STORAGE_KEY);
  assert.deepEqual(await loadLlmSettings(storage), settings);
  assert.equal(storage.values[PREFERENCES_STORAGE_KEY], undefined);
});

test("normalizes whitespace and trailing slashes", () => {
  const normalized = normalizeLlmSettings({
    provider: "lm-studio",
    lmStudio: {
      baseUrl: " http://127.0.0.1:1234/v1/// ",
      model: " local-model ",
      apiKey: " local-token ",
    },
  });

  assert.equal(normalized.lmStudio.baseUrl, "http://127.0.0.1:1234/v1");
  assert.equal(normalized.lmStudio.model, "local-model");
  assert.equal(normalized.lmStudio.apiKey, "local-token");
});

test("adds the LM Studio OpenAI-compatible v1 path to a server origin", () => {
  const normalized = normalizeLlmSettings({
    provider: "lm-studio",
    lmStudio: {
      baseUrl: "http://localhost:1234/",
      model: "local-model",
      apiKey: "",
    },
  });

  assert.equal(normalized.lmStudio.baseUrl, "http://localhost:1234/v1");
  assert.equal(getActiveLlmConnection(normalized)?.baseUrl, "http://localhost:1234/v1");
  assert.equal(normalizeLlmSettings({
    lmStudio: { baseUrl: "http://localhost:1234/proxy/v1/" },
  }).lmStudio.baseUrl, "http://localhost:1234/proxy/v1");
});
