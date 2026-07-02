import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { PageStatus, PageStatusResponse } from "./messages";
import "./popup.css";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; page: PageStatus }
  | { status: "unavailable"; message: string };

function PopupApp() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void loadCurrentPageStatus().then(setState);
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
