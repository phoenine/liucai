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
} from "../src/settings/llmSettings.ts";
import { PREFERENCES_STORAGE_KEY } from "../src/shared/preferences.ts";

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
  assert.equal(DEFAULT_LLM_SETTINGS.openai.baseUrl, OPENAI_BASE_URL);
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
    openai: { baseUrl: OPENAI_BASE_URL, model: "online-model", apiKey: "sk-test" },
  }), true);
});

test("stores LLM credentials separately from ordinary preferences", async () => {
  const storage = new MemoryStorage();
  const settings = {
    ...DEFAULT_LLM_SETTINGS,
    provider: "openai" as const,
    openai: { baseUrl: OPENAI_BASE_URL, model: "online-model", apiKey: "sk-local-only" },
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

test("refuses model endpoints that would send the API key somewhere unsafe", () => {
  const complete = (baseUrl: string): boolean => isLlmSettingsComplete(normalizeLlmSettings({
    provider: "lm-studio",
    lmStudio: { baseUrl, model: "local-model", apiKey: "secret" },
  }));

  // Plain http to a remote host would carry the key in clear text.
  assert.equal(complete("http://evil.example/v1"), false);
  // Credentials embedded in the URL would leak into logs and error messages.
  assert.equal(complete("https://user:pass@evil.example/v1"), false);
  // Local servers over http, and any https endpoint, stay allowed.
  assert.equal(complete("http://localhost:1234/v1"), true);
  assert.equal(complete("http://127.0.0.1:1234/v1"), true);
  assert.equal(complete("https://models.example/v1"), true);
});

test("lets the OpenAI connection point at any compatible endpoint", () => {
  const normalized = normalizeLlmSettings({
    provider: "openai",
    openai: { baseUrl: " https://models.example/ ", model: " online-model ", apiKey: " sk-test " },
  });

  assert.equal(normalized.openai.baseUrl, "https://models.example/v1");
  assert.equal(normalized.openai.apiKey, "sk-test");
  assert.equal(getActiveLlmConnection(normalized)?.baseUrl, "https://models.example/v1");

  // A gateway that already exposes a path keeps it; only a bare origin gains /v1.
  assert.equal(normalizeLlmSettings({
    provider: "openai",
    openai: { baseUrl: "https://gateway.example/openai/v1/", model: "m", apiKey: "k" },
  }).openai.baseUrl, "https://gateway.example/openai/v1");
  assert.equal(normalizeLlmSettings({
    provider: "openai",
    openai: { baseUrl: "http://localhost:8080", model: "m", apiKey: "k" },
  }).openai.baseUrl, "http://localhost:8080/v1");
});

test("keeps the official OpenAI endpoint for settings stored before it was configurable", () => {
  const legacy = normalizeLlmSettings({
    provider: "openai",
    openai: { model: "online-model", apiKey: "sk-test" },
  });

  assert.equal(legacy.openai.baseUrl, OPENAI_BASE_URL);
  assert.equal(getActiveLlmConnection(legacy)?.baseUrl, OPENAI_BASE_URL);
});

test("refuses an OpenAI-compatible endpoint that would send the API key somewhere unsafe", () => {
  const complete = (baseUrl: string): boolean => isLlmSettingsComplete(normalizeLlmSettings({
    provider: "openai",
    openai: { baseUrl, model: "online-model", apiKey: "sk-test" },
  }));

  assert.equal(complete("http://evil.example/v1"), false);
  assert.equal(complete("https://user:pass@evil.example/v1"), false);
  assert.equal(complete("not-a-url"), false);
  assert.equal(complete("http://localhost:8080/v1"), true);
  assert.equal(complete("https://models.example/v1"), true);
});
