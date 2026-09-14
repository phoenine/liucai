import type { HighlightColor } from "./types";

export const PREFERENCES_STORAGE_KEY = "liucai.preferences.v1";
export type InterfaceLanguage = "auto" | "zh-CN" | "en";

export interface LiucaiPreferencesV1 {
  version: 1;
  general: {
    interfaceLanguage: InterfaceLanguage;
  };
  highlights: {
    defaultAnnotationColor: HighlightColor;
  };
}

export interface PreferenceStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export const DEFAULT_PREFERENCES: LiucaiPreferencesV1 = {
  version: 1,
  general: {
    interfaceLanguage: "auto",
  },
  highlights: {
    defaultAnnotationColor: "gold",
  },
};

export function normalizePreferences(value: unknown): LiucaiPreferencesV1 {
  const candidate = isRecord(value) ? value : {};
  const general = isRecord(candidate.general) ? candidate.general : {};
  const highlights = isRecord(candidate.highlights) ? candidate.highlights : {};
  const interfaceLanguage = isInterfaceLanguage(general.interfaceLanguage)
    ? general.interfaceLanguage
    : DEFAULT_PREFERENCES.general.interfaceLanguage;
  const defaultAnnotationColor = isHighlightColor(highlights.defaultAnnotationColor)
    ? highlights.defaultAnnotationColor
    : DEFAULT_PREFERENCES.highlights.defaultAnnotationColor;

  return {
    version: 1,
    general: { interfaceLanguage },
    highlights: { defaultAnnotationColor },
  };
}

export async function loadPreferences(
  storage: PreferenceStorage = resolvePreferenceStorage(),
): Promise<LiucaiPreferencesV1> {
  const stored = await storage.get(PREFERENCES_STORAGE_KEY);
  return normalizePreferences(stored[PREFERENCES_STORAGE_KEY]);
}

export async function savePreferences(
  preferences: LiucaiPreferencesV1,
  storage: PreferenceStorage = resolvePreferenceStorage(),
): Promise<LiucaiPreferencesV1> {
  const normalized = normalizePreferences(preferences);
  await storage.set({ [PREFERENCES_STORAGE_KEY]: normalized });
  return normalized;
}

function resolvePreferenceStorage(): PreferenceStorage {
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

function isHighlightColor(value: unknown): value is HighlightColor {
  return value === "gold" || value === "mint" || value === "coral";
}

function isInterfaceLanguage(value: unknown): value is InterfaceLanguage {
  return value === "auto" || value === "zh-CN" || value === "en";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
