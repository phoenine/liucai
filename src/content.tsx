import { type ReactNode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { db, getActiveHighlights, normalizeHighlightRecord, upsertPage } from "./db";
import { canonicalizeUrl } from "./url";
import { createSelectorFromRange, rangesFromSelectors } from "./domText";
import { applyHighlight, removeHighlightFromDom, updateHighlightAttributes } from "./highlightDom";
import type { HighlightColor, HighlightRecord, PageRecord } from "./types";

const COLORS: Array<{ color: HighlightColor; value: string; label: string }> = [
  { color: "gold", value: "#FFEA70", label: "暖黄" },
  { color: "mint", value: "#4DF4C9", label: "薄荷" },
  { color: "coral", value: "#FFAFA1", label: "珊瑚" },
];

const INTERACTIVE_CONTENT_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "textarea",
  "select",
  "summary",
  "[role='button']",
  "[role='link']",
  "[contenteditable='true']",
].join(",");

type EditorFocus = "note" | "tags";
type ToolbarRootState = { root: Root; node: HTMLElement } | null;
type PageStatusRequest = { type: "LIUCAI_GET_PAGE_STATUS" };

let currentSelectionRange: Range | null = null;
let toolbarRoot: ToolbarRootState = null;
let popoverRoot: ToolbarRootState = null;
let sidebarRoot: ToolbarRootState = null;
let miniSidebarRoot: ToolbarRootState = null;
let sidebarOpen = false;
let pagePromise: Promise<PageRecord> | null = null;

const canonicalUrl = canonicalizeUrl(location.href);

void initialize().catch((error) => reportError("initialize", error));

async function initialize(): Promise<void> {
  await getCurrentPage();
  await restoreHighlights();
  await refreshSidebarData();

  document.addEventListener("mouseup", handleMouseUp, true);
  document.addEventListener("keydown", handleKeyDown, true);
  document.addEventListener("click", handleDocumentClickEvent, true);
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  window.addEventListener("beforeunload", cleanup);
}

function cleanup(): void {
  document.removeEventListener("mouseup", handleMouseUp, true);
  document.removeEventListener("keydown", handleKeyDown, true);
  document.removeEventListener("click", handleDocumentClickEvent, true);
  chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
  window.removeEventListener("beforeunload", cleanup);
  hideToolbar();
  hidePopover();
  hideSidebar();
  hideMiniSidebar();
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    hideToolbar();
    hidePopover();
  }
}

function getCurrentPage(): Promise<PageRecord> {
  pagePromise ??= upsertPage(canonicalUrl, location.href, document.title).catch((error) => {
    pagePromise = null;
    throw error;
  });
  return pagePromise;
}

async function restoreHighlights(): Promise<void> {
  const records = await getActiveHighlights(canonicalUrl);
  const ranges = rangesFromSelectors(records.map((record) => record.selector));

  records.forEach((record, index) => {
    if (document.querySelector(`.liucai-highlight[data-id="${CSS.escape(record.id)}"]`)) {
      return;
    }
    const range = ranges[index];
    if (range) {
      applyHighlight(range, record);
    }
  });
}

function handleMouseUp(event: MouseEvent): void {
  if ((event.target as Element | null)?.closest?.(".liucai-toolbar,.liucai-popover,.liucai-sidebar,.liucai-mini-sidebar,.liucai-highlight")) {
    return;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.toString().trim()) {
    hideToolbar();
    return;
  }

  currentSelectionRange = selection.getRangeAt(0).cloneRange();
  const rect = currentSelectionRange.getBoundingClientRect();
  showSelectionToolbar(rect.left + rect.width / 2, Math.max(8, rect.top - 56));
}

function handleDocumentClickEvent(event: MouseEvent): void {
  runAsync("handle highlight click", () => handleDocumentClick(event));
}

async function handleDocumentClick(event: MouseEvent): Promise<void> {
  const target = event.target as Element | null;
  if (target?.closest?.(".liucai-toolbar,.liucai-popover,.liucai-sidebar,.liucai-mini-sidebar")) return;

  const highlightEl = target?.closest?.(".liucai-highlight") as HTMLElement | null;
  if (!highlightEl) return;

  const id = highlightEl.dataset.id;
  if (!id) return;

  if (shouldAllowNativeClick(event, target, highlightEl)) return;

  event.preventDefault();
  event.stopPropagation();

  const record = await db.highlights.get(id);
  if (!record || record.deletedAt) return;

  const rect = highlightEl.getBoundingClientRect();
  showHighlightToolbar(normalizeHighlightRecord(record), rect.left + rect.width / 2, Math.max(8, rect.top - 54));
}

function shouldAllowNativeClick(event: MouseEvent, target: Element | null, highlightEl: HTMLElement): boolean {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return true;
  }

  const interactive = target?.closest?.(INTERACTIVE_CONTENT_SELECTOR);
  return Boolean(interactive && interactive.contains(highlightEl));
}

function showSelectionToolbar(centerX: number, top: number): void {
  const node = createToolbarNode(centerX, top, 164, "liucai-toolbar--selection");
  toolbarRoot = renderInto(node, (
    <SelectionToolbar
      onColor={(color) => runAsync("create highlight", () => createHighlight(color, { openEditor: false }))}
      onNote={() => runAsync("create note highlight", () => createHighlight("gold", { openEditor: true, focus: "note" }))}
      onTags={() => runAsync("create tagged highlight", () => createHighlight("gold", { openEditor: true, focus: "tags" }))}
    />
  ));
}

function showHighlightToolbar(record: HighlightRecord, centerX: number, top: number): void {
  const node = createToolbarNode(centerX, top, 164, "liucai-toolbar--highlight");
  toolbarRoot = renderInto(node, (
    <ExistingHighlightToolbar
      record={record}
      onColor={(color) => runAsync("update highlight color", () => updateHighlightColor(record.id, color))}
      onNote={() => showEditorPopover(record, centerX - 140, top + 54, "note")}
      onTags={() => showEditorPopover(record, centerX - 140, top + 54, "tags")}
      onCopy={() => runAsync("copy highlight text", () => copyHighlightText(record))}
      onDelete={() => runAsync("delete highlight", () => deleteHighlight(record.id))}
    />
  ));
}

function SelectionToolbar(props: {
  onColor: (color: HighlightColor) => void;
  onNote: () => void;
  onTags: () => void;
}) {
  return (
    <>
      {COLORS.map((item) => (
        <ColorButton key={item.color} item={item} onClick={() => props.onColor(item.color)} />
      ))}
      <span className="liucai-toolbar-divider" />
      <IconButton kind="note" label="批注" onClick={props.onNote}>{icons.note}</IconButton>
      <IconButton kind="tag" label="标签" onClick={props.onTags}>{icons.tag}</IconButton>
    </>
  );
}

function ExistingHighlightToolbar(props: {
  record: HighlightRecord;
  onColor: (color: HighlightColor) => void;
  onNote: () => void;
  onTags: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <>
      <IconButton kind="palette" label="修改颜色" onClick={() => setPaletteOpen((open) => !open)}>{icons.palette}</IconButton>
      <IconButton kind="note" label="批注" onClick={props.onNote}>{icons.note}</IconButton>
      <IconButton kind="tag" label="标签" onClick={props.onTags}>{icons.tag}</IconButton>
      <IconButton
        kind={`copy${copied ? " is-copied" : ""}`}
        label={copied ? "已复制" : "复制摘录"}
        onClick={() => {
          props.onCopy();
          setCopied(true);
          window.setTimeout(() => setCopied(false), 900);
        }}
      >
        {icons.copy}
      </IconButton>
      <IconButton kind="delete" label="删除" onClick={props.onDelete}>{icons.delete}</IconButton>
      {paletteOpen ? (
        <div className="liucai-palette-popout">
          {COLORS.map((item) => (
            <ColorButton key={item.color} item={item} onClick={() => props.onColor(item.color)} />
          ))}
        </div>
      ) : null}
    </>
  );
}

function MiniSidebarLauncher(props: { count: number; open: boolean; onToggle: () => void }) {
  return (
    <button className={`liucai-mini-sidebar${props.open ? " is-open" : ""}`} title="六彩划线列表" onClick={props.onToggle}>
      <span className="liucai-mini-sidebar__icon">{icons.list}</span>
      <span className="liucai-mini-sidebar__count">{props.count}</span>
    </button>
  );
}

function HighlightSidebar(props: {
  records: HighlightRecord[];
  onClose: () => void;
  onLocate: (id: string) => void;
  onEdit: (record: HighlightRecord) => void;
  onCopy: (record: HighlightRecord) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="liucai-sidebar" aria-label="六彩划线列表">
      <header className="liucai-sidebar__header">
        <div>
          <div className="liucai-sidebar__eyebrow">当前页面</div>
          <h2>划线列表</h2>
        </div>
        <button className="liucai-sidebar__close" title="收起" onClick={props.onClose}>{icons.close}</button>
      </header>
      <div className="liucai-sidebar__summary">
        <span>{props.records.length} 条划线</span>
        <span>{document.title || "未命名页面"}</span>
      </div>
      {props.records.length === 0 ? (
        <div className="liucai-sidebar__empty">
          <strong>还没有划线</strong>
          <span>在网页中选中文本后，点击颜色即可加入这里。</span>
        </div>
      ) : (
        <div className="liucai-sidebar__list">
          {props.records.map((record, index) => (
            <HighlightSidebarItem
              key={record.id}
              index={index + 1}
              record={record}
              onLocate={() => props.onLocate(record.id)}
              onEdit={() => props.onEdit(record)}
              onCopy={() => props.onCopy(record)}
              onDelete={() => props.onDelete(record.id)}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

function HighlightSidebarItem(props: {
  index: number;
  record: HighlightRecord;
  onLocate: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const tags = Array.isArray(props.record.tags) ? props.record.tags : [];
  return (
    <article className="liucai-sidebar-item" data-color={props.record.color}>
      <button className="liucai-sidebar-item__main" onClick={props.onLocate} title="定位到网页划线">
        <span className="liucai-sidebar-item__dot" />
        <span className="liucai-sidebar-item__index">{String(props.index).padStart(2, "0")}</span>
        <span className="liucai-sidebar-item__text">{props.record.text}</span>
      </button>
      {props.record.note.trim() ? <p className="liucai-sidebar-item__note">{props.record.note.trim()}</p> : null}
      {tags.length > 0 ? (
        <div className="liucai-sidebar-item__tags">
          {tags.map((tag) => <span key={tag}>#{tag}</span>)}
        </div>
      ) : null}
      <div className="liucai-sidebar-item__actions">
        <button onClick={props.onEdit}>编辑</button>
        <button onClick={props.onCopy}>复制</button>
        <button data-danger="true" onClick={props.onDelete}>删除</button>
      </div>
    </article>
  );
}

function ColorButton(props: { item: { color: HighlightColor; value: string; label: string }; onClick: () => void }) {
  return (
    <button
      className="liucai-color-button"
      data-color={props.item.color}
      style={{ "--dot-color": props.item.value } as React.CSSProperties}
      title={props.item.label}
      aria-label={props.item.label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onClick();
      }}
    />
  );
}

function IconButton(props: { kind: string; label: string; children: ReactNode; onClick: () => void }) {
  return (
    <button
      className={`liucai-icon-button liucai-icon-button--${props.kind}`}
      title={props.label}
      aria-label={props.label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onClick();
      }}
    >
      {props.children}
    </button>
  );
}

function showEditorPopover(record: HighlightRecord, left: number, top: number, focus: EditorFocus = "note"): void {
  const safeRecord = normalizeHighlightRecord(record);
  const node = createPopoverNode(left, top);
  popoverRoot = renderInto(node, (
    <EditorPopover
      record={safeRecord}
      focus={focus}
      onCancel={hidePopover}
      onSave={(id, note, tags) => runAsync("save highlight meta", () => saveHighlightMeta(id, note, tags))}
    />
  ));
  fitPopoverInViewport(node);
}

function EditorPopover(props: {
  record: HighlightRecord;
  focus: EditorFocus;
  onCancel: () => void;
  onSave: (id: string, note: string, tags: string[]) => void;
}) {
  const [note, setNote] = useState(props.record.note);
  const [tagText, setTagText] = useState(props.record.tags.join("，"));

  return (
    <>
      <div className="liucai-popover-title">批注与标签</div>
      <label className="liucai-field-label">批注</label>
      <textarea
        autoFocus={props.focus === "note"}
        value={note}
        placeholder="写下这条高亮的想法……"
        onChange={(event) => setNote(event.currentTarget.value)}
      />
      <label className="liucai-field-label">标签</label>
      <input
        className="liucai-tag-input"
        autoFocus={props.focus === "tags"}
        value={tagText}
        placeholder="输入标签，如 AI/Agent，测试/用例设计"
        onChange={(event) => setTagText(event.currentTarget.value)}
      />
      <div className="liucai-popover-actions">
        <button data-action="cancel" onClick={props.onCancel}>取消</button>
        <button data-action="save" onClick={() => props.onSave(props.record.id, note, parseTags(tagText))}>保存</button>
      </div>
    </>
  );
}

function createToolbarNode(centerX: number, top: number, width: number, stateClass: string): HTMLElement {
  hideToolbar();
  const node = document.createElement("div");
  node.className = `liucai-toolbar ${stateClass}`;
  node.style.left = `${Math.min(Math.max(8, centerX - width / 2), window.innerWidth - width - 8)}px`;
  node.style.top = `${Math.min(Math.max(8, top), window.innerHeight - 58)}px`;
  document.body.append(node);
  return node;
}

function createPopoverNode(left: number, top: number): HTMLElement {
  hidePopover();
  const node = document.createElement("div");
  node.className = "liucai-popover liucai-editor-popover";
  node.style.left = `${Math.min(Math.max(8, left), Math.max(8, window.innerWidth - 336))}px`;
  node.style.top = `${Math.min(Math.max(8, top), Math.max(8, window.innerHeight - 328))}px`;
  node.style.visibility = "hidden";
  document.body.append(node);
  return node;
}

function fitPopoverInViewport(node: HTMLElement): void {
  window.requestAnimationFrame(() => {
    const margin = 8;
    const rect = node.getBoundingClientRect();
    const nextLeft = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - rect.width - margin));
    const nextTop = Math.min(Math.max(margin, rect.top), Math.max(margin, window.innerHeight - rect.height - margin));
    node.style.left = `${nextLeft}px`;
    node.style.top = `${nextTop}px`;
    node.style.visibility = "visible";
  });
}

function renderInto(node: HTMLElement, children: ReactNode): { root: Root; node: HTMLElement } {
  const root = createRoot(node);
  root.render(children);
  return { root, node };
}

function hideToolbar(): void {
  toolbarRoot?.root.unmount();
  toolbarRoot?.node.remove();
  toolbarRoot = null;
}

function hidePopover(): void {
  popoverRoot?.root.unmount();
  popoverRoot?.node.remove();
  popoverRoot = null;
}

async function refreshSidebarData(): Promise<void> {
  const records = await getActiveHighlights(canonicalUrl);
  renderMiniSidebar(records.length);
  if (sidebarOpen) {
    renderSidebar(records);
  }
}

function renderMiniSidebar(count: number): void {
  const launcher = <MiniSidebarLauncher count={count} open={sidebarOpen} onToggle={() => runAsync("toggle sidebar", toggleSidebar)} />;
  if (miniSidebarRoot) {
    miniSidebarRoot.root.render(launcher);
    return;
  }
  miniSidebarRoot = renderInto(createMiniSidebarNode(), launcher);
}

function createMiniSidebarNode(): HTMLElement {
  const node = document.createElement("div");
  node.className = "liucai-mini-sidebar-root";
  document.body.append(node);
  return node;
}

async function toggleSidebar(): Promise<void> {
  if (sidebarOpen) {
    hideSidebar();
    sidebarOpen = false;
    await refreshSidebarData();
    return;
  }

  sidebarOpen = true;
  await refreshSidebarData();
}

function renderSidebar(records: HighlightRecord[]): void {
  hideSidebar();
  const node = document.createElement("div");
  node.className = "liucai-sidebar-root";
  document.body.append(node);
  sidebarRoot = renderInto(node, (
    <HighlightSidebar
      records={records}
      onClose={() => {
        sidebarOpen = false;
        hideSidebar();
        runAsync("refresh mini sidebar", refreshSidebarData);
      }}
      onLocate={locateHighlight}
      onEdit={editHighlightFromSidebar}
      onCopy={(record) => runAsync("copy sidebar highlight text", () => copyHighlightText(record))}
      onDelete={(id) => runAsync("delete sidebar highlight", () => deleteHighlight(id))}
    />
  ));
}

function hideSidebar(): void {
  sidebarRoot?.root.unmount();
  sidebarRoot?.node.remove();
  sidebarRoot = null;
}

function hideMiniSidebar(): void {
  miniSidebarRoot?.root.unmount();
  miniSidebarRoot?.node.remove();
  miniSidebarRoot = null;
}

function locateHighlight(id: string): void {
  const span = getHighlightSpans(id)[0];
  if (!span) return;
  span.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  span.classList.add("liucai-highlight--focused");
  window.setTimeout(() => span.classList.remove("liucai-highlight--focused"), 1400);
}

function editHighlightFromSidebar(record: HighlightRecord): void {
  hideToolbar();
  showEditorPopover(record, window.innerWidth - 690, 88, "note");
}

async function createHighlight(
  color: HighlightColor,
  options: { openEditor: boolean; focus?: EditorFocus },
): Promise<void> {
  const range = currentSelectionRange;
  hideToolbar();
  window.getSelection()?.removeAllRanges();

  if (!range) return;
  const selector = createSelectorFromRange(range);
  if (!selector) return;

  const page = await getCurrentPage();
  const now = new Date().toISOString();
  const highlight: HighlightRecord = {
    id: crypto.randomUUID(),
    pageId: page.id,
    canonicalUrl,
    text: selector.exact,
    color,
    note: "",
    tags: [],
    selector,
    createdAt: now,
    updatedAt: now,
  };

  const spans = applyHighlight(range, highlight);
  if (spans.length === 0) {
    console.warn("[六彩] create highlight skipped: no DOM spans were created");
    currentSelectionRange = null;
    return;
  }

  try {
    await db.highlights.add(highlight);
  } catch (error) {
    removeHighlightFromDom(highlight.id);
    throw error;
  }

  const rect = spans[0]?.getBoundingClientRect() ?? range.getBoundingClientRect();
  currentSelectionRange = null;

  if (options.openEditor) {
    showEditorPopover(highlight, rect.left, rect.bottom + 8, options.focus ?? "note");
  }
  await refreshSidebarData();
}

async function saveHighlightMeta(id: string, note: string, tags: string[]): Promise<void> {
  const record = await db.highlights.get(id);
  if (!record) return;

  const updated: HighlightRecord = { ...normalizeHighlightRecord(record), note, tags, updatedAt: new Date().toISOString() };
  await db.highlights.put(updated);
  updateHighlightAttributes(updated);
  hidePopover();
  await refreshSidebarData();
}

async function updateHighlightColor(id: string, color: HighlightColor): Promise<void> {
  const record = await db.highlights.get(id);
  if (!record) return;

  const updated: HighlightRecord = { ...normalizeHighlightRecord(record), color, updatedAt: new Date().toISOString() };
  await db.highlights.put(updated);
  for (const span of getHighlightSpans(id)) span.dataset.color = color;
  hideToolbar();
  await refreshSidebarData();
}

async function copyHighlightText(record: HighlightRecord): Promise<void> {
  await copyText(record.text);
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch (error) {
    console.warn("[六彩] navigator.clipboard.writeText failed, falling back to execCommand", error);
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Fallback copy command failed");
  }
}

async function deleteHighlight(id: string): Promise<void> {
  const record = await db.highlights.get(id);
  if (!record) return;

  await db.highlights.put({ ...normalizeHighlightRecord(record), deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  removeHighlightFromDom(id);
  hideToolbar();
  hidePopover();
  await refreshSidebarData();
}

function handleRuntimeMessage(
  message: unknown,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
): boolean | undefined {
  if (!isPageStatusRequest(message)) {
    return undefined;
  }

  void getActiveHighlights(canonicalUrl)
    .then((records) => {
      sendResponse({
        ok: true,
        canonicalUrl,
        title: document.title,
        highlightCount: records.length,
      });
    })
    .catch((error) => {
      reportError("popup status", error);
      sendResponse({ ok: false, error: stringifyError(error) });
    });

  return true;
}

function isPageStatusRequest(message: unknown): message is PageStatusRequest {
  return typeof message === "object" && message !== null && (message as PageStatusRequest).type === "LIUCAI_GET_PAGE_STATUS";
}

function getHighlightSpans(id: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`.liucai-highlight[data-id="${CSS.escape(id)}"]`));
}

function parseTags(value: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of value.split(/[,\n\uFF0C]+/)) {
    const tag = raw.trim().replace(/^#/, "");
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function runAsync(label: string, task: () => Promise<void>): void {
  void task().catch((error) => reportError(label, error));
}

function reportError(scope: string, error: unknown): void {
  console.warn(`[六彩] ${scope} failed:`, error);
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const icons = {
  note: (
    <svg {...iconProps}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
  ),
  tag: (
    <svg {...iconProps}><path d="M20.6 13.1 13.1 20.6a2 2 0 0 1-2.8 0L3 13.3V3h10.3l7.3 7.3a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1" /></svg>
  ),
  delete: (
    <svg {...iconProps}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v5" /><path d="M14 11v5" /></svg>
  ),
  copy: (
    <svg {...iconProps}><rect x="9" y="9" width="13" height="13" rx="2" /><rect x="2" y="2" width="13" height="13" rx="2" /></svg>
  ),
  palette: (
    <svg {...iconProps}><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><path d="M12 22a10 10 0 1 1 10-10 3.5 3.5 0 0 1-3.5 3.5h-1.2a2 2 0 0 0-1.4 3.4l.3.3A1.7 1.7 0 0 1 15 22Z" /></svg>
  ),
  list: (
    <svg {...iconProps}><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></svg>
  ),
  close: (
    <svg {...iconProps}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
  ),
};
