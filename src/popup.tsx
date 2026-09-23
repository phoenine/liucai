import { GearSixIcon, ListBulletsIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  PageStatus,
  PageStatusResponse,
  StorageResponse,
  SyncRequest,
  SyncStatus,
} from "./shared/messages";
import {
  getPopupCopy,
  resolveInterfaceLocale,
  type PopupCopy,
} from "./shared/localization";
import { DEFAULT_PREFERENCES, loadPreferences } from "./shared/preferences";
import "./popup.css";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; page: PageStatus }
  | { status: "unavailable"; message: string };

function PopupApp() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const locale = resolveInterfaceLocale(preferences.general.interfaceLanguage);
  const copy = getPopupCopy(locale);

  useEffect(() => {
    void loadPreferences()
      .catch(() => DEFAULT_PREFERENCES)
      .then((loaded) => {
        setPreferences(loaded);
        const loadedCopy = getPopupCopy(resolveInterfaceLocale(loaded.general.interfaceLanguage));
        void loadCurrentPageStatus(loadedCopy).then(setState);
        void sendSyncRequest({ type: "LIUCAI_SYNC_GET_STATUS" }, loadedCopy.syncUnavailable)
          .then(setSyncStatus)
          .catch((error) => setAuthNotice(error instanceof Error ? error.message : String(error)));
      });
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const page = state.status === "ready" ? state.page : null;
  const siteDisabled = page?.disabled === true;

  async function toggleCurrentSite(): Promise<void> {
    if (!page?.hostname || updating) {
      return;
    }

    setUpdating(true);
    setActionError(null);
    try {
      const updatedPage = await setCurrentSiteDisabled(!siteDisabled, copy);
      setState({ status: "ready", page: updatedPage });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdating(false);
    }
  }

  async function submitAuth(action: "sign-in" | "sign-up"): Promise<void> {
    if (authBusy) return;
    if (!email.trim() || password.length < 6) {
      setAuthNotice(copy.authValidation);
      return;
    }
    setAuthBusy(true);
    setAuthNotice(null);
    try {
      const next = await sendSyncRequest({
        type: action === "sign-in" ? "LIUCAI_SYNC_SIGN_IN" : "LIUCAI_SYNC_SIGN_UP",
        email,
        password,
      }, copy.syncUnavailable);
      setSyncStatus(next);
      setPassword("");
      if (action === "sign-up" && !next.signedIn) {
        setAuthNotice(copy.signUpConfirmation);
      }
    } catch (error) {
      setAuthNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function runSyncAction(type: "LIUCAI_SYNC_SIGN_OUT" | "LIUCAI_SYNC_RETRY"): Promise<void> {
    if (authBusy) return;
    setAuthBusy(true);
    setAuthNotice(null);
    try {
      setSyncStatus(await sendSyncRequest({ type }, copy.syncUnavailable));
    } catch (error) {
      setAuthNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(false);
    }
  }

  return (
    <main className="lc-popup">
      <header className="lc-popup__header">
        <div className="lc-popup__brand">
          <img alt="" aria-hidden="true" className="lc-popup__logo" src="icon128.png" />
          <div>
            <h1>六彩 Liucai</h1>
            <p>{copy.tagline}</p>
          </div>
        </div>
        <button
          aria-label={copy.settings}
          className="lc-popup__settings-button"
          onClick={() => void openSettings()}
          title={copy.settings}
          type="button"
        >
          <GearSixIcon aria-hidden="true" size={20} weight="regular" />
        </button>
      </header>

      <section className={`lc-popup__card lc-popup__status${siteDisabled ? " lc-popup__status--disabled" : ""}`}>
        <h2>{copy.currentPage}</h2>
        {renderStatus(state, copy)}
      </section>

      <button
        className="lc-popup__library-button"
        onClick={() => void openHighlights()}
        type="button"
      >
        <ListBulletsIcon aria-hidden="true" size={18} weight="bold" />
        {copy.viewAllHighlights}
      </button>

      <section className="lc-popup__card lc-popup__sync">
        <h2>{copy.cloudSync}</h2>
        {syncStatus === null ? (
          <p className="lc-popup__muted">{copy.checkingSync}</p>
        ) : syncStatus.signedIn ? (
          <div>
            <div className="lc-popup__sync-row">
              <div>
                <p className="lc-popup__account">{syncStatus.email ?? copy.signedIn}</p>
                <p className="lc-popup__muted">{formatSyncSummary(syncStatus, copy, locale)}</p>
              </div>
              <span className={`lc-popup__sync-dot${syncStatus.error ? " lc-popup__sync-dot--error" : ""}`} />
            </div>
            <div className="lc-popup__button-row">
              <button disabled={authBusy} onClick={() => void runSyncAction("LIUCAI_SYNC_RETRY")} type="button">
                {authBusy ? copy.working : copy.syncNow}
              </button>
              <button className="lc-popup__button--quiet" disabled={authBusy} onClick={() => void runSyncAction("LIUCAI_SYNC_SIGN_OUT")} type="button">
                {copy.signOut}
              </button>
            </div>
          </div>
        ) : syncStatus.configured === false ? (
          <p className="lc-popup__muted">{copy.supabaseNotConfigured}</p>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); void submitAuth("sign-in"); }}>
            <input
              autoComplete="email"
              disabled={authBusy}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={copy.email}
              type="email"
              value={email}
            />
            <input
              autoComplete="current-password"
              disabled={authBusy}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={copy.password}
              type="password"
              value={password}
            />
            <div className="lc-popup__button-row">
              <button disabled={authBusy} type="submit">{authBusy ? copy.working : copy.signIn}</button>
              <button className="lc-popup__button--quiet" disabled={authBusy} onClick={() => void submitAuth("sign-up")} type="button">{copy.signUp}</button>
            </div>
          </form>
        )}
        {authNotice || syncStatus?.error ? (
          <p className="lc-popup__action-error" role="alert">{authNotice ?? syncStatus?.error}</p>
        ) : null}
      </section>

      <section className="lc-popup__card">
        <h2>{copy.quickActions}</h2>
        <ul>
          <li>{copy.selectionAction}</li>
          <li>{copy.existingHighlightAction}</li>
          <li>{copy.learningSelectionAction}</li>
          <li>{copy.localStorageAction}</li>
        </ul>
      </section>

      {page?.hostname ? (
        <section className="lc-popup__card lc-popup__site-action">
          <button
            className={`lc-popup__site-button${siteDisabled ? " lc-popup__site-button--restore" : ""}`}
            disabled={updating}
            onClick={() => void toggleCurrentSite()}
            type="button"
          >
            {updating ? copy.updating : siteDisabled ? copy.restoreSite : copy.disableSite}
          </button>
          {actionError ? <p className="lc-popup__action-error" role="alert">{actionError}</p> : null}
        </section>
      ) : null}
    </main>
  );
}

async function openSettings(): Promise<void> {
  if (typeof chrome !== "undefined" && chrome.runtime?.openOptionsPage) {
    await chrome.runtime.openOptionsPage();
    return;
  }

  window.location.href = "options.html";
}

async function openHighlights(): Promise<void> {
  const url = typeof chrome !== "undefined" && chrome.runtime?.getURL
    ? chrome.runtime.getURL("highlights.html")
    : "highlights.html";
  if (typeof chrome !== "undefined" && chrome.tabs?.create) {
    await chrome.tabs.create({ url });
    window.close();
    return;
  }
  window.location.href = url;
}

function formatSyncSummary(
  status: SyncStatus,
  copy: PopupCopy,
  locale: "zh-CN" | "en",
): string {
  if (status.syncing) return copy.syncing(status.pendingCount);
  if (status.error) return copy.syncFailed(status.pendingCount);
  if (status.pendingCount > 0) return copy.pendingSync(status.pendingCount);
  if (status.lastSyncedAt) {
    return copy.syncedAt(new Date(status.lastSyncedAt).toLocaleString(locale));
  }
  return copy.awaitingFirstSync;
}

async function sendSyncRequest(request: SyncRequest, fallbackError: string): Promise<SyncStatus> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    throw new Error(fallbackError);
  }
  const response = await chrome.runtime.sendMessage(request) as StorageResponse<SyncStatus> | undefined;
  if (!response?.ok) throw new Error(response?.error ?? fallbackError);
  return response.data;
}

function renderStatus(state: LoadState, copy: PopupCopy) {
  if (state.status === "loading") {
    return <p className="lc-popup__muted">{copy.readingPage}</p>;
  }

  if (state.status === "unavailable") {
    return <p className="lc-popup__muted">{state.message}</p>;
  }

  const count = state.page.highlightCount ?? 0;
  if (state.page.disabled) {
    return (
      <div>
        <div className="lc-popup__disabled-state">{copy.disabled}</div>
        <p className="lc-popup__muted">
          {state.page.hostname ? `${state.page.hostname} · ${copy.siteDisabled}` : copy.siteDisabled}
        </p>
        {state.page.title ? <p className="lc-popup__title" title={state.page.title}>{state.page.title}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <div className="lc-popup__count">{count}</div>
      <p className="lc-popup__muted">{copy.highlightCount}</p>
      {state.page.title ? <p className="lc-popup__title" title={state.page.title}>{state.page.title}</p> : null}
    </div>
  );
}

async function loadCurrentPageStatus(copy: PopupCopy): Promise<LoadState> {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) {
    return { status: "unavailable", message: copy.scriptUnavailable };
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return { status: "unavailable", message: copy.tabNotFound };
  }

  try {
    const page = (await chrome.tabs.sendMessage(tab.id, { type: "LIUCAI_GET_PAGE_STATUS" })) as PageStatusResponse | undefined;
    if (!page?.ok) {
      return { status: "unavailable", message: page?.error ?? copy.pageUnavailable };
    }
    return { status: "ready", page };
  } catch {
    return { status: "unavailable", message: copy.scriptUnavailable };
  }
}

async function setCurrentSiteDisabled(disabled: boolean, copy: PopupCopy): Promise<PageStatus> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error(copy.tabNotFound);
  }

  const page = (await chrome.tabs.sendMessage(tab.id, {
    type: "LIUCAI_SET_SITE_DISABLED",
    disabled,
  })) as PageStatusResponse | undefined;

  if (!page?.ok) {
    throw new Error(page?.error ?? copy.siteUpdateFailed);
  }

  return page;
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<PopupApp />);
}
