import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const authStorage = {
  async getItem(key: string): Promise<string | null> {
    const values = await chrome.storage.local.get(key);
    return typeof values[key] === "string" ? values[key] : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  },
  async removeItem(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  },
};

let client: SupabaseClient | null | undefined;

export function getSupabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client;

  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) {
    client = null;
    return client;
  }
  if (!url.startsWith("https://") || key.includes("secret") || key.includes("service_role")) {
    throw new Error("Supabase 客户端配置无效；扩展只能使用 HTTPS URL 和 publishable key。");
  }

  client = createClient(url, key, {
    auth: {
      storage: authStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
