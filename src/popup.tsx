import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./popup.css";

interface PageStatus {
  ok: boolean;
  canonicalUrl?: string;
  title?: string;
  highlightCount?: number;
  error?: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; page: PageStatus }
  | { status: "unavailable"; message: string };

function PopupApp() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    void loadCurrentPageStatus().then(setState);
  }, []);

  return (
    <main className="lc-popup">
      <header className="lc-popup__header">
        <div className="lc-popup__logo">六</div>
        <div>
          <h1>六彩 Liucai</h1>
          <p>本地网页高亮与批注</p>
        </div>
      </header>

      <section className="lc-popup__card lc-popup__status">
        <h2>当前页面</h2>
        {renderStatus(state)}
      </section>

      <section className="lc-popup__card">
        <h2>快速操作</h2>
        <ul>
          <li>选中文本：六色高亮 + 批注 + 标签</li>
          <li>点击已划线：调色盘 + 批注 + 标签 + 复制 + 删除</li>
          <li>数据保存到 Chrome IndexedDB</li>
        </ul>
      </section>

      <section className="lc-popup__hint">
        Obsidian 同步后续再接入；当前先保证 Chrome 插件本地体验稳定。
      </section>
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
    const page = (await chrome.tabs.sendMessage(tab.id, { type: "LIUCAI_GET_PAGE_STATUS" })) as PageStatus | undefined;
    if (!page?.ok) {
      return { status: "unavailable", message: page?.error ?? "当前页面暂不可读取。" };
    }
    return { status: "ready", page };
  } catch {
    return { status: "unavailable", message: "当前页面未注入六彩脚本，请在普通网页中使用。" };
  }
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<PopupApp />);
}
