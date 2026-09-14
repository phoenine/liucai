const DISABLED_HOSTNAMES_KEY = "disabledHostnames";

export interface SitePreferenceStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export function hostnameFromUrl(rawUrl: string): string | null {
  try {
    return normalizeHostname(new URL(rawUrl).hostname) || null;
  } catch {
    return null;
  }
}

export async function isHostnameDisabled(
  hostname: string,
  storage: SitePreferenceStorage = chrome.storage.local,
): Promise<boolean> {
  return (await getDisabledHostnames(storage)).includes(normalizeHostname(hostname));
}

export async function setHostnameDisabled(
  hostname: string,
  disabled: boolean,
  storage: SitePreferenceStorage = chrome.storage.local,
): Promise<void> {
  const normalized = normalizeHostname(hostname);
  const hostnames = new Set(await getDisabledHostnames(storage));

  if (disabled) {
    hostnames.add(normalized);
  } else {
    hostnames.delete(normalized);
  }

  await storage.set({ [DISABLED_HOSTNAMES_KEY]: Array.from(hostnames).sort() });
}

async function getDisabledHostnames(storage: SitePreferenceStorage): Promise<string[]> {
  const result = await storage.get(DISABLED_HOSTNAMES_KEY);
  const stored = result[DISABLED_HOSTNAMES_KEY];
  if (!Array.isArray(stored)) {
    return [];
  }

  return Array.from(
    new Set(stored.filter((value): value is string => typeof value === "string").map(normalizeHostname).filter(Boolean)),
  );
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}
