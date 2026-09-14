const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "spm",
]);

export interface PageIdentity {
  href: string;
  canonicalUrl: string;
}

export function canonicalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (!url.hash.startsWith("#/") && !url.hash.startsWith("#!/")) {
    url.hash = "";
  }
  for (const key of Array.from(url.searchParams.keys())) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

export function createPageIdentity(rawUrl: string): PageIdentity {
  return {
    href: rawUrl,
    canonicalUrl: canonicalizeUrl(rawUrl),
  };
}

export function hasPageIdentityChanged(current: PageIdentity, nextHref: string): boolean {
  return current.canonicalUrl !== canonicalizeUrl(nextHref);
}
