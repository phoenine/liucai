export type PageStatusRequest = { type: "LIUCAI_GET_PAGE_STATUS" };
export type SetSiteDisabledRequest = { type: "LIUCAI_SET_SITE_DISABLED"; disabled: boolean };

export interface PageStatus {
  ok: true;
  canonicalUrl: string;
  hostname: string;
  title: string;
  highlightCount: number;
  disabled: boolean;
}

export interface PageStatusError {
  ok: false;
  error: string;
}

export type PageStatusResponse = PageStatus | PageStatusError;

export function isPageStatusRequest(message: unknown): message is PageStatusRequest {
  return typeof message === "object" && message !== null && (message as PageStatusRequest).type === "LIUCAI_GET_PAGE_STATUS";
}

export function isSetSiteDisabledRequest(message: unknown): message is SetSiteDisabledRequest {
  return (
    typeof message === "object"
    && message !== null
    && (message as SetSiteDisabledRequest).type === "LIUCAI_SET_SITE_DISABLED"
    && typeof (message as SetSiteDisabledRequest).disabled === "boolean"
  );
}
