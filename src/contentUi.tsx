import { type ReactNode, useState } from "react";
import { continueNoteList, parseNoteBlocks } from "./noteFormat";
import {
  nextDeleteState,
  runCopyAction,
  type CopyStatus,
  type DeleteState,
} from "./sidebarActionState";
import { parseTags } from "./tags";
import type { HighlightColor, HighlightRecord } from "./types";

const COLORS: Array<{ color: HighlightColor; value: string; label: string }> = [
  { color: "gold", value: "#FFEA70", label: "暖黄" },
  { color: "mint", value: "#4DF4C9", label: "薄荷" },
  { color: "coral", value: "#FFAFA1", label: "珊瑚" },
];

export type EditorFocus = "note" | "tags";

export function SelectionToolbar(props: {
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

export function ExistingHighlightToolbar(props: {
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

export function MiniSidebarLauncher(props: { count: number; open: boolean; onToggle: () => void }) {
  return (
    <button className={`liucai-mini-sidebar${props.open ? " is-open" : ""}`} title="六彩划线列表" onClick={props.onToggle}>
      <span className="liucai-mini-sidebar__icon">{icons.list}</span>
      <span className="liucai-mini-sidebar__count">{props.count}</span>
    </button>
  );
}

export function HighlightSidebar(props: {
  pageTitle: string;
  records: HighlightRecord[];
  onClose: () => void;
  onLocate: (id: string) => void;
  onEdit: (record: HighlightRecord) => void;
  onCopy: (record: HighlightRecord) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <aside className="liucai-sidebar" aria-label="六彩划线列表">
      <header className="liucai-sidebar__header">
        <div className="liucai-sidebar__heading">
          <h2>划线列表</h2>
          <span className="liucai-sidebar__count">{props.records.length} 条</span>
        </div>
        <button className="liucai-sidebar__close" title="收起" onClick={props.onClose}>{icons.close}</button>
      </header>
      <div
        className="liucai-sidebar__page-title"
        title={props.pageTitle || "未命名页面"}
      >
        {props.pageTitle || "未命名页面"}
      </div>
      <div aria-hidden="true" className="liucai-sidebar__divider" />
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
  onCopy: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const tags = Array.isArray(props.record.tags) ? props.record.tags : [];
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [deleteState, setDeleteState] = useState<DeleteState>("idle");
  const copyLabel = {
    idle: "复制",
    copying: "复制中…",
    copied: "已复制",
    failed: "复制失败",
  }[copyStatus];

  const handleCopy = (): void => {
    void runCopyAction(props.onCopy, setCopyStatus)
      .catch(() => undefined)
      .finally(() => {
        window.setTimeout(() => setCopyStatus("idle"), 1200);
      });
  };

  const handleDelete = (): void => {
    setDeleteState((state) => nextDeleteState(state, "confirm"));
    void props.onDelete().catch(() => {
      setDeleteState((state) => nextDeleteState(state, "fail"));
    });
  };

  return (
    <article className="liucai-sidebar-item" data-color={props.record.color}>
      <button
        aria-label={`定位第 ${props.index} 条划线`}
        className="liucai-sidebar-item__rail"
        onClick={props.onLocate}
        title="定位到网页划线"
      >
        <span aria-hidden="true" className="liucai-sidebar-item__dot" />
        <span className="liucai-sidebar-item__index">{String(props.index).padStart(2, "0")}</span>
        <span aria-hidden="true" className="liucai-sidebar-item__line" />
      </button>
      <div className="liucai-sidebar-item__content">
        <button className="liucai-sidebar-item__main" onClick={props.onLocate} title="定位到网页划线">
          <span className="liucai-sidebar-item__text">{props.record.text}</span>
        </button>
        {props.record.note.trim() ? (
          <div className="liucai-sidebar-item__note">
            <FormattedNote value={props.record.note.trim()} />
          </div>
        ) : null}
        {tags.length > 0 ? (
          <div className="liucai-sidebar-item__tags">
            {tags.map((tag) => <span key={tag}>#{tag}</span>)}
          </div>
        ) : null}
        <div className="liucai-sidebar-item__actions">
          {deleteState === "idle" ? (
            <>
              <button onClick={props.onEdit}>编辑</button>
              <button
                aria-live="polite"
                data-status={copyStatus}
                disabled={copyStatus !== "idle"}
                onClick={handleCopy}
              >
                {copyLabel}
              </button>
              <button
                data-danger="true"
                onClick={() => setDeleteState((state) => nextDeleteState(state, "request"))}
              >
                删除
              </button>
            </>
          ) : (
            <>
              <button
                disabled={deleteState === "deleting"}
                onClick={() => setDeleteState((state) => nextDeleteState(state, "cancel"))}
              >
                取消
              </button>
              <button
                data-danger="true"
                disabled={deleteState === "deleting"}
                onClick={handleDelete}
              >
                {deleteState === "deleting" ? "删除中…" : "确认删除"}
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export function HighlightTooltip(props: { note: string; tags: string[] }) {
  return (
    <>
      {props.note.trim() ? (
        <div className="liucai-highlight-tooltip__note">
          <FormattedNote value={props.note.trim()} />
        </div>
      ) : null}
      {props.tags.length > 0 ? (
        <div className="liucai-highlight-tooltip__tags">
          {props.tags.map((tag, index) => <span key={`${tag}-${index}`}>#{tag}</span>)}
        </div>
      ) : null}
    </>
  );
}

export function FormattedNote(props: { value: string }) {
  return (
    <>
      {parseNoteBlocks(props.value).map((block, index) => {
        if (block.type === "paragraph") {
          return <p className="liucai-note-paragraph" key={index}>{block.lines.join("\n")}</p>;
        }
        if (block.type === "ordered-list") {
          return (
            <ol className="liucai-note-list liucai-note-list--ordered" key={index} start={block.start}>
              {block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
            </ol>
          );
        }
        return (
          <ul className="liucai-note-list liucai-note-list--unordered" key={index}>
            {block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
          </ul>
        );
      })}
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

export function EditorPopover(props: {
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
        placeholder="写下想法；输入 1. 或 - 创建列表……"
        onChange={(event) => setNote(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing) {
            return;
          }
          const textarea = event.currentTarget;
          const edit = continueNoteList(note, textarea.selectionStart, textarea.selectionEnd);
          if (!edit) {
            return;
          }
          event.preventDefault();
          setNote(edit.value);
          window.requestAnimationFrame(() => {
            textarea.setSelectionRange(edit.caret, edit.caret);
          });
        }}
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
