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

type EditorFocus = "note" | "tags";
type ToolbarRootState = { root: Root; node: HTMLElement } | null;
type PageStatusRequest = { type: "LIUCAI_GET_PAGE_STATUS" };

let currentSelectionRange: Range | null = null;
let toolbarRoot: ToolbarRootState = null;
let popoverRoot: ToolbarRootState = null;
let pagePromise: Promise<PageRecord> | null = null;

const canonicalUrl = canonicalizeUrl(location.href);

void initialize().catch((error) => reportError("initialize", error));

async function initialize(): Promise<void> {
  await getCurrentPage();
  await restoreHighlights();

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
  if ((event.target as Element | null)?.closest?.(".liucai-toolbar,.liucai-popover,.liucai-highlight")) {
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
  if (target?.closest?.(".liucai-toolbar,.liucai-popover")) return;

  const highlightEl = target?.closest?.(".liucai-highlight") as HTMLElement | null;
  if (!highlightEl) return;

  event.preventDefault();
  event.stopPropagation();

  const id = highlightEl.dataset.id;
  if (!id) return;

  const record = await db.highlights.get(id);
  if (!record || record.deletedAt) return;

  const rect = highlightEl.getBoundingClientRect();
  showHighlightToolbar(normalizeHighlightRecord(record), rect.left + rect.width / 2, Math.max(8, rect.top - 54));
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
      <div className="liucai-popover-excerpt">{props.record.text}</div>
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
  node.style.left = `${Math.min(Math.max(8, left), window.innerWidth - 336)}px`;
  node.style.top = `${Math.min(Math.max(8, top), window.innerHeight - 292)}px`;
  document.body.append(node);
  return node;
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

  await db.highlights.add(highlight);
  const spans = applyHighlight(range, highlight);
  const rect = spans[0]?.getBoundingClientRect() ?? range.getBoundingClientRect();
  currentSelectionRange = null;

  if (options.openEditor) {
    showEditorPopover(highlight, rect.left, rect.bottom + 8, options.focus ?? "note");
  }
}

async function saveHighlightMeta(id: string, note: string, tags: string[]): Promise<void> {
  const record = await db.highlights.get(id);
  if (!record) return;

  const updated: HighlightRecord = { ...normalizeHighlightRecord(record), note, tags, updatedAt: new Date().toISOString() };
  await db.highlights.put(updated);
  updateHighlightAttributes(updated);
  hidePopover();
}

async function updateHighlightColor(id: string, color: HighlightColor): Promise<void> {
  const record = await db.highlights.get(id);
  if (!record) return;

  const updated: HighlightRecord = { ...normalizeHighlightRecord(record), color, updatedAt: new Date().toISOString() };
  await db.highlights.put(updated);
  for (const span of getHighlightSpans(id)) span.dataset.color = color;
  hideToolbar();
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
};
