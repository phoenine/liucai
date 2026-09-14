export const LLM_SETTINGS_STORAGE_KEY = "liucai.llm.settings.v1";
export const OPENAI_BASE_URL = "https://api.openai.com/v1";

export type LlmProvider = "lm-studio" | "openai";

export interface LlmSettingsV1 {
  version: 1;
  provider: LlmProvider;
  lmStudio: {
    baseUrl: string;
    model: string;
    apiKey: string;
  };
  openai: {
    /** Any OpenAI-compatible endpoint; defaults to the official OpenAI API. */
    baseUrl: string;
    model: string;
    apiKey: string;
  };
}

export interface LlmConnection {
  baseUrl: string;
  model: string;
  apiKey: string;
}

interface LlmSettingsStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export const DEFAULT_LLM_SETTINGS: LlmSettingsV1 = {
  version: 1,
  provider: "lm-studio",
  lmStudio: {
    baseUrl: "http://localhost:1234/v1",
    model: "",
    apiKey: "",
  },
  openai: {
    baseUrl: OPENAI_BASE_URL,
    model: "",
    apiKey: "",
  },
};

export function normalizeLlmSettings(value: unknown): LlmSettingsV1 {
  const candidate = isRecord(value) ? value : {};
  const lmStudio = isRecord(candidate.lmStudio) ? candidate.lmStudio : {};
  const openai = isRecord(candidate.openai) ? candidate.openai : {};

  return {
    version: 1,
    provider: isLlmProvider(candidate.provider)
      ? candidate.provider
      : DEFAULT_LLM_SETTINGS.provider,
    lmStudio: {
      baseUrl: normalizeBaseUrl(lmStudio.baseUrl, DEFAULT_LLM_SETTINGS.lmStudio.baseUrl),
      model: normalizeString(lmStudio.model),
      apiKey: normalizeString(lmStudio.apiKey),
    },
    openai: {
      baseUrl: normalizeBaseUrl(openai.baseUrl, OPENAI_BASE_URL),
      model: normalizeString(openai.model),
      apiKey: normalizeString(openai.apiKey),
    },
  };
}

export function isLlmSettingsComplete(settings: LlmSettingsV1): boolean {
  if (settings.provider === "openai") {
    return isHttpUrl(settings.openai.baseUrl)
      && Boolean(settings.openai.model.trim() && settings.openai.apiKey.trim());
  }
  return isHttpUrl(settings.lmStudio.baseUrl) && Boolean(settings.lmStudio.model.trim());
}

export function getActiveLlmConnection(settings: LlmSettingsV1): LlmConnection | null {
  const normalized = normalizeLlmSettings(settings);
  if (!isLlmSettingsComplete(normalized)) return null;
  return normalized.provider === "openai"
    ? {
      baseUrl: normalized.openai.baseUrl,
      model: normalized.openai.model,
      apiKey: normalized.openai.apiKey,
    }
    : {
      baseUrl: normalized.lmStudio.baseUrl,
      model: normalized.lmStudio.model,
      apiKey: normalized.lmStudio.apiKey,
    };
}

export async function loadLlmSettings(
  storage: LlmSettingsStorage = resolveStorage(),
): Promise<LlmSettingsV1> {
  const stored = await storage.get(LLM_SETTINGS_STORAGE_KEY);
  return normalizeLlmSettings(stored[LLM_SETTINGS_STORAGE_KEY]);
}

export async function saveLlmSettings(
  settings: LlmSettingsV1,
  storage: LlmSettingsStorage = resolveStorage(),
): Promise<LlmSettingsV1> {
  const normalized = normalizeLlmSettings(settings);
  await storage.set({ [LLM_SETTINGS_STORAGE_KEY]: normalized });
  return normalized;
}

function normalizeBaseUrl(value: unknown, fallback: string): string {
  const candidate = normalizeString(value);
  if (!candidate) return fallback;
  try {
    const url = new URL(candidate);
    if (url.pathname === "/" || url.pathname === "") {
      url.pathname = "/v1";
    } else {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return candidate.replace(/\/+$/, "");
  }
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    // Credentials embedded in the URL would leak into logs and error messages.
    if (url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    // Plain http is only acceptable for a model running on this machine; anywhere else it would send
    // the API key over the network in clear text.
    return url.protocol === "http:" && isLocalHostname(url.hostname);
  } catch {
    return false;
  }
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || hostname === "[::1]";
}

function isLlmProvider(value: unknown): value is LlmProvider {
  return value === "lm-studio" || value === "openai";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveStorage(): LlmSettingsStorage {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    return chrome.storage.local;
  }

  return {
    async get(key) {
      const raw = globalThis.localStorage?.getItem(key);
      if (!raw) return {};
      try {
        return { [key]: JSON.parse(raw) as unknown };
      } catch {
        return {};
      }
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) {
        globalThis.localStorage?.setItem(key, JSON.stringify(value));
      }
    },
  };
}
