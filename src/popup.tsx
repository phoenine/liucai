import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  PageStatus,
  PageStatusResponse,
  StorageResponse,
  SyncRequest,
  SyncStatus,
} from "./messages";
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

  useEffect(() => {
    void loadCurrentPageStatus().then(setState);
    void sendSyncRequest({ type: "LIUCAI_SYNC_GET_STATUS" })
      .then(setSyncStatus)
      .catch((error) => setAuthNotice(error instanceof Error ? error.message : String(error)));
  }, []);

  const page = state.status === "ready" ? state.page : null;
  const siteDisabled = page?.disabled === true;

  async function toggleCurrentSite(): Promise<void> {
    if (!page?.hostname || updating) {
      return;
    }

    setUpdating(true);
    setActionError(null);
    try {
      const updatedPage = await setCurrentSiteDisabled(!siteDisabled);
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
      setAuthNotice("请输入邮箱，密码至少 6 位。");
      return;
    }
    setAuthBusy(true);
    setAuthNotice(null);
    try {
      const next = await sendSyncRequest({
        type: action === "sign-in" ? "LIUCAI_SYNC_SIGN_IN" : "LIUCAI_SYNC_SIGN_UP",
        email,
        password,
      });
      setSyncStatus(next);
      setPassword("");
      if (action === "sign-up" && !next.signedIn) {
        setAuthNotice("注册成功，请按 Supabase 邮件完成验证后再登录。");
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
      setSyncStatus(await sendSyncRequest({ type }));
    } catch (error) {
      setAuthNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(false);
    }
  }

  return (
    <main className="lc-popup">
      <header className="lc-popup__header">
        <div className="lc-popup__logo">六</div>
        <div>
          <h1>六彩 Liucai</h1>
          <p>本地网页高亮与批注</p>
        </div>
      </header>

      <section className={`lc-popup__card lc-popup__status${siteDisabled ? " lc-popup__status--disabled" : ""}`}>
        <h2>当前页面</h2>
        {renderStatus(state)}
      </section>

      <section className="lc-popup__card lc-popup__sync">
        <h2>云端同步</h2>
        {syncStatus?.signedIn ? (
          <div>
            <div className="lc-popup__sync-row">
              <div>
                <p className="lc-popup__account">{syncStatus.email ?? "已登录"}</p>
                <p className="lc-popup__muted">{formatSyncSummary(syncStatus)}</p>
              </div>
              <span className={`lc-popup__sync-dot${syncStatus.error ? " lc-popup__sync-dot--error" : ""}`} />
            </div>
            <div className="lc-popup__button-row">
              <button disabled={authBusy} onClick={() => void runSyncAction("LIUCAI_SYNC_RETRY")} type="button">
                {authBusy ? "处理中……" : "立即同步"}
              </button>
              <button className="lc-popup__button--quiet" disabled={authBusy} onClick={() => void runSyncAction("LIUCAI_SYNC_SIGN_OUT")} type="button">
                退出
              </button>
            </div>
          </div>
        ) : syncStatus?.configured === false ? (
          <p className="lc-popup__muted">构建时尚未配置 Supabase。</p>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); void submitAuth("sign-in"); }}>
            <input
              autoComplete="email"
              disabled={authBusy}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="邮箱"
              type="email"
              value={email}
            />
            <input
              autoComplete="current-password"
              disabled={authBusy}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="密码（至少 6 位）"
              type="password"
              value={password}
            />
            <div className="lc-popup__button-row">
              <button disabled={authBusy} type="submit">{authBusy ? "处理中……" : "登录"}</button>
              <button className="lc-popup__button--quiet" disabled={authBusy} onClick={() => void submitAuth("sign-up")} type="button">注册</button>
            </div>
          </form>
        )}
        {authNotice || syncStatus?.error ? (
          <p className="lc-popup__action-error" role="alert">{authNotice ?? syncStatus?.error}</p>
        ) : null}
      </section>

      <section className="lc-popup__card">
        <h2>快速操作</h2>
        <ul>
          <li>选中文本：三色高亮 + 批注 + 标签</li>
          <li>点击已划线：调色盘 + 批注 + 标签 + 复制 + 删除</li>
          <li>数据保存到 Chrome IndexedDB</li>
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
            {updating ? "正在更新……" : siteDisabled ? "恢复此网站划线" : "在此网站禁用划线"}
          </button>
          {actionError ? <p className="lc-popup__action-error" role="alert">{actionError}</p> : null}
        </section>
      ) : null}
    </main>
  );
}

function formatSyncSummary(status: SyncStatus): string {
  if (status.syncing) return `同步中 · ${status.pendingCount} 条待上传`;
  if (status.error) return `同步失败 · ${status.pendingCount} 条待上传`;
  if (status.pendingCount > 0) return `${status.pendingCount} 条等待同步`;
  if (status.lastSyncedAt) return `已同步 · ${new Date(status.lastSyncedAt).toLocaleString("zh-CN")}`;
  return "已登录，等待首次同步";
}

async function sendSyncRequest(request: SyncRequest): Promise<SyncStatus> {
  const response = await chrome.runtime.sendMessage(request) as StorageResponse<SyncStatus> | undefined;
  if (!response?.ok) throw new Error(response?.error ?? "同步服务暂不可用。");
  return response.data;
}

function renderStatus(state: LoadState) {
  if (state.status === "loading") {
    return <p className="lc-popup__muted">正在读取当前页状态……</p>;
  }

  if (state.status === "unavailable") {
    return <p className="lc-popup__muted">{state.message}</p>;
  }

  const count = state.page.highlightCount ?? 0;
  if (state.page.disabled) {
    return (
      <div>
        <div className="lc-popup__disabled-state">已禁用</div>
        <p className="lc-popup__muted">
          {state.page.hostname ? `${state.page.hostname} · 此域名不显示划线入口` : "此域名不显示划线入口"}
        </p>
        {state.page.title ? <p className="lc-popup__title" title={state.page.title}>{state.page.title}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <div className="lc-popup__count">{count}</div>
      <p className="lc-popup__muted">当前页高亮数量</p>
      {state.page.title ? <p className="lc-popup__title" title={state.page.title}>{state.page.title}</p> : null}
    </div>
  );
}

async function loadCurrentPageStatus(): Promise<LoadState> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return { status: "unavailable", message: "未找到当前标签页。" };
  }

  try {
    const page = (await chrome.tabs.sendMessage(tab.id, { type: "LIUCAI_GET_PAGE_STATUS" })) as PageStatusResponse | undefined;
    if (!page?.ok) {
      return { status: "unavailable", message: page?.error ?? "当前页面暂不可读取。" };
    }
    return { status: "ready", page };
  } catch {
    return { status: "unavailable", message: "当前页面未注入六彩脚本，请在普通网页中使用。" };
  }
}

async function setCurrentSiteDisabled(disabled: boolean): Promise<PageStatus> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("未找到当前标签页。");
  }

  const page = (await chrome.tabs.sendMessage(tab.id, {
    type: "LIUCAI_SET_SITE_DISABLED",
    disabled,
  })) as PageStatusResponse | undefined;

  if (!page?.ok) {
    throw new Error(page?.error ?? "网站设置更新失败。");
  }

  return page;
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<PopupApp />);
}
