import {
  CopyIcon,
  DownloadSimpleIcon,
  ListBulletsIcon,
  NotePencilIcon,
  PaletteIcon,
  SparkleIcon,
  TagIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useEffect, useState } from "react";
import { MAX_NOTE_LENGTH } from "../ai/aiNote";
import type { ContentCopy } from "../shared/localization";
import type { AiExplanation } from "../shared/messages";
import { continueNoteList } from "./noteFormat";
import { SafeMarkdown } from "./safeMarkdown";
import {
  nextDeleteState,
  runCopyAction,
  type CopyStatus,
  type DeleteState,
} from "./sidebarActionState";
import { HIGHLIGHT_ACCENT } from "./highlightTooltip";
import { parseTags } from "./tags";
import type { HighlightColor, HighlightRecord } from "../shared/types";

const COLORS: Array<{ color: HighlightColor; value: string }> = [
  { color: "gold", value: HIGHLIGHT_ACCENT.gold },
  { color: "mint", value: HIGHLIGHT_ACCENT.mint },
  { color: "coral", value: HIGHLIGHT_ACCENT.coral },
];

export type EditorFocus = "note" | "tags";

export function SelectionToolbar(props: {
  copy: ContentCopy;
  onColor: (color: HighlightColor) => void;
  onNote: () => void;
  onTags: () => void;
  onAi?: () => void;
}) {
  return (
    <>
      {COLORS.map((item) => (
        <ColorButton
          key={item.color}
          item={item}
          label={props.copy.colors[item.color]}
          onClick={() => props.onColor(item.color)}
        />
      ))}
      <span className="liucai-toolbar-divider" />
      <IconButton kind="note" label={props.copy.note} onClick={props.onNote}>
        <NotePencilIcon aria-hidden weight="regular" />
      </IconButton>
      <IconButton kind="tag" label={props.copy.tags} onClick={props.onTags}>
        <TagIcon aria-hidden weight="regular" />
      </IconButton>
      {props.onAi ? (
        <IconButton kind="ai" label={props.copy.aiUnderstanding} onClick={props.onAi}>
          <SparkleIcon aria-hidden weight="regular" />
        </IconButton>
      ) : null}
    </>
  );
}

export function LearningToolbar(props: {
  copy: ContentCopy;
  onAi: () => void;
}) {
  return (
    <IconButton kind="ai" label={props.copy.aiUnderstanding} onClick={props.onAi}>
      <SparkleIcon aria-hidden weight="regular" />
    </IconButton>
  );
}

export type AiExplanationCardState =
  | { status: "loading" }
  | { status: "streaming"; explanation: string }
  | { status: "error"; error: string }
  | { status: "success"; explanation: AiExplanation };

export function AiExplanationCard(props: {
  copy: ContentCopy;
  subject: string;
  state: AiExplanationCardState;
  canAppend: boolean;
  onLoadExample: (onUpdate: (text: string) => void) => Promise<string>;
  onAppend: (example?: string) => Promise<void>;
  onRetry: () => void;
  onClose: () => void;
}) {
  const [exampleOpen, setExampleOpen] = useState(false);
  const [example, setExample] = useState("");
  const [exampleStatus, setExampleStatus] = useState<"idle" | "loading" | "failed">("idle");
  const [appendStatus, setAppendStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  useEffect(() => {
    setExampleOpen(false);
    setExample("");
    setExampleStatus("idle");
    setAppendStatus("idle");
  }, [props.state.status === "success" ? props.state.explanation : props.state.status]);

  const append = (): void => {
    setAppendStatus("saving");
    void props.onAppend(example || undefined)
      .then(() => setAppendStatus("saved"))
      .catch(() => setAppendStatus("failed"));
  };

  const toggleExample = (): void => {
    if (example) {
      setExampleOpen((open) => !open);
      return;
    }
    if (exampleStatus === "loading") return;
    setExampleStatus("loading");
    void props.onLoadExample((text) => {
      setExample(text);
      setExampleOpen(true);
    })
      .then((value) => {
        setExample(value);
        setExampleOpen(true);
        setExampleStatus("idle");
      })
      .catch(() => setExampleStatus("failed"));
  };

  return (
    <section
      aria-label={`${props.copy.aiTitle}: ${props.subject}`}
      aria-live="polite"
      className="liucai-ai-card"
    >
      <header className="liucai-ai-card__header">
        <div className="liucai-ai-card__title">
          <SparkleIcon aria-hidden weight="regular" />
          <span title={props.subject}>{props.subject}</span>
        </div>
        <button className="liucai-ai-card__close" title={props.copy.aiClose} onClick={props.onClose}>
          <XIcon aria-hidden weight="regular" />
        </button>
      </header>

      {props.state.status === "loading" ? (
        <div className="liucai-ai-card__loading">
          <span className="liucai-ai-card__spinner" />
          {props.copy.aiLoading}
        </div>
      ) : null}

      {props.state.status === "streaming" ? (
        <div className="liucai-ai-card__explanation">
          <SafeMarkdown>{props.state.explanation}</SafeMarkdown>
        </div>
      ) : null}

      {props.state.status === "error" ? (
        <div className="liucai-ai-card__error">
          <strong>{props.copy.aiFailed}</strong>
          <span>{props.copy.aiError(props.state.error)}</span>
          <button data-action="secondary" onClick={props.onRetry}>{props.copy.aiRetry}</button>
        </div>
      ) : null}

      {props.state.status === "success" ? (
        <>
          <div className="liucai-ai-card__explanation">
            <SafeMarkdown>{props.state.explanation.explanation}</SafeMarkdown>
          </div>
          {exampleOpen ? (
            <div className="liucai-ai-card__example"><SafeMarkdown>{example}</SafeMarkdown></div>
          ) : null}
          {!props.canAppend ? (
            <p className="liucai-ai-card__hint is-warning">{props.copy.aiAppendUnavailable}</p>
          ) : null}
          <div className="liucai-ai-card__actions">
            <button data-action="secondary" onClick={toggleExample} disabled={exampleStatus === "loading"}>
              {exampleStatus === "loading"
                ? props.copy.aiExampleLoading
                : exampleStatus === "failed"
                  ? props.copy.aiExampleFailed
                  : exampleOpen
                    ? props.copy.aiHideExample
                    : props.copy.aiExample}
            </button>
            <button data-action="secondary" disabled title={props.copy.aiThoughtCardLater}>
              {props.copy.aiThoughtCard}
            </button>
            <button
              data-action="primary"
              disabled={!props.canAppend || appendStatus === "saving" || appendStatus === "saved"}
              onClick={append}
            >
              {appendStatus === "saving"
                ? props.copy.aiAppending
                : appendStatus === "saved"
                  ? props.copy.aiAppended
                  : props.copy.aiAppendNote}
            </button>
          </div>
          {appendStatus === "failed" ? (
            <p className="liucai-ai-card__hint is-warning">{props.copy.aiError("AI_NOTE_SAVE_FAILED")}</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function ExistingHighlightToolbar(props: {
  copy: ContentCopy;
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
      <IconButton
        kind="palette"
        label={props.copy.changeColor}
        onClick={() => setPaletteOpen((open) => !open)}
      >
        <PaletteIcon aria-hidden weight="regular" />
      </IconButton>
      <IconButton kind="note" label={props.copy.note} onClick={props.onNote}>
        <NotePencilIcon aria-hidden weight="regular" />
      </IconButton>
      <IconButton kind="tag" label={props.copy.tags} onClick={props.onTags}>
        <TagIcon aria-hidden weight="regular" />
      </IconButton>
      <IconButton
        kind={`copy${copied ? " is-copied" : ""}`}
        label={copied ? props.copy.copied : props.copy.copyExcerpt}
        onClick={() => {
          props.onCopy();
          setCopied(true);
          window.setTimeout(() => setCopied(false), 900);
        }}
      >
        <CopyIcon aria-hidden weight="regular" />
      </IconButton>
      <IconButton kind="delete" label={props.copy.delete} onClick={props.onDelete}>
        <TrashIcon aria-hidden weight="regular" />
      </IconButton>
      {paletteOpen ? (
        <div className="liucai-palette-popout">
          {COLORS.map((item) => (
            <ColorButton
              key={item.color}
              item={item}
              label={props.copy.colors[item.color]}
              onClick={() => props.onColor(item.color)}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

export function MiniSidebarLauncher(props: {
  copy: ContentCopy;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className={`liucai-mini-sidebar${props.open ? " is-open" : ""}`}
      title={props.copy.sidebarLabel}
      onClick={props.onToggle}
    >
      <span className="liucai-mini-sidebar__icon">
        <ListBulletsIcon aria-hidden weight="regular" />
      </span>
      <span className="liucai-mini-sidebar__count">{props.count}</span>
    </button>
  );
}

export function HighlightSidebar(props: {
  copy: ContentCopy;
  pageTitle: string;
  records: HighlightRecord[];
  onClose: () => void;
  onExport: () => Promise<void>;
  onLocate: (id: string) => void;
  onEdit: (record: HighlightRecord) => void;
  onCopy: (record: HighlightRecord) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [exportStatus, setExportStatus] = useState<CopyStatus>("idle");
  const exportLabel = {
    idle: props.copy.export,
    copying: props.copy.exporting,
    copied: props.copy.exported,
    failed: props.copy.exportFailed,
  }[exportStatus];

  const handleExport = (): void => {
    void runCopyAction(props.onExport, setExportStatus)
      .catch(() => undefined)
      .finally(() => {
        window.setTimeout(() => setExportStatus("idle"), 1400);
      });
  };

  return (
    <aside className="liucai-sidebar" aria-label={props.copy.sidebarLabel}>
      <header className="liucai-sidebar__header">
        <div className="liucai-sidebar__heading">
          <h2>{props.copy.sidebarTitle}</h2>
          <span className="liucai-sidebar__count">{props.copy.highlightCount(props.records.length)}</span>
        </div>
        <button className="liucai-sidebar__close" title={props.copy.collapse} onClick={props.onClose}>
          <XIcon aria-hidden weight="regular" />
        </button>
      </header>
      <div
        className="liucai-sidebar__page-title"
        title={props.pageTitle || props.copy.untitledPage}
      >
        {props.pageTitle || props.copy.untitledPage}
      </div>
      <div className="liucai-sidebar__export">
        <div className="liucai-sidebar__export-copy">
          <strong>{props.copy.exportTitle}</strong>
          <span>{props.copy.exportDescription}</span>
        </div>
        <button
          aria-live="polite"
          data-status={exportStatus}
          disabled={exportStatus !== "idle" || props.records.length === 0}
          onClick={handleExport}
          type="button"
        >
          <DownloadSimpleIcon aria-hidden weight="regular" />
          <span>{exportLabel}</span>
        </button>
      </div>
      <div aria-hidden="true" className="liucai-sidebar__divider" />
      {props.records.length === 0 ? (
        <div className="liucai-sidebar__empty">
          <strong>{props.copy.emptyTitle}</strong>
          <span>{props.copy.emptyDescription}</span>
        </div>
      ) : (
        <div className="liucai-sidebar__list">
          {props.records.map((record, index) => (
            <HighlightSidebarItem
              key={record.id}
              copy={props.copy}
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
  copy: ContentCopy;
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
    idle: props.copy.copy,
    copying: props.copy.copying,
    copied: props.copy.copied,
    failed: props.copy.copyFailed,
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
        aria-label={props.copy.locateLabel(props.index)}
        className="liucai-sidebar-item__rail"
        onClick={props.onLocate}
        title={props.copy.locateTitle}
      >
        <span aria-hidden="true" className="liucai-sidebar-item__dot" />
        <span className="liucai-sidebar-item__index">{String(props.index).padStart(2, "0")}</span>
        <span aria-hidden="true" className="liucai-sidebar-item__line" />
      </button>
      <div className="liucai-sidebar-item__content">
        <button className="liucai-sidebar-item__main" onClick={props.onLocate} title={props.copy.locateTitle}>
          <span className="liucai-sidebar-item__text">{props.record.text}</span>
        </button>
        {props.record.note.trim() ? (
          <section aria-label={props.copy.note} className="liucai-sidebar-item__note">
            <span aria-hidden="true" className="liucai-sidebar-item__note-stamp">注</span>
            <SafeMarkdown>{props.record.note.trim()}</SafeMarkdown>
          </section>
        ) : null}
        {tags.length > 0 ? (
          <div className="liucai-sidebar-item__tags">
            {tags.map((tag) => <span key={tag}>#{tag}</span>)}
          </div>
        ) : null}
        <div className="liucai-sidebar-item__actions">
          {deleteState === "idle" ? (
            <>
              <button onClick={props.onEdit}>{props.copy.edit}</button>
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
                {props.copy.delete}
              </button>
            </>
          ) : (
            <>
              <button
                disabled={deleteState === "deleting"}
                onClick={() => setDeleteState((state) => nextDeleteState(state, "cancel"))}
              >
                {props.copy.cancel}
              </button>
              <button
                data-danger="true"
                disabled={deleteState === "deleting"}
                onClick={handleDelete}
              >
                {deleteState === "deleting" ? props.copy.deleting : props.copy.confirmDelete}
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
          <SafeMarkdown>{props.note.trim()}</SafeMarkdown>
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

function ColorButton(props: {
  item: { color: HighlightColor; value: string };
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="liucai-color-button"
      data-color={props.item.color}
      style={{ "--dot-color": props.item.value } as React.CSSProperties}
      title={props.label}
      aria-label={props.label}
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
  copy: ContentCopy;
  record: HighlightRecord;
  focus: EditorFocus;
  onDirtyChange?: (dirty: boolean) => void;
  onCancel: () => void;
  onSave: (id: string, note: string, tags: string[]) => void | Promise<void>;
}) {
  const [note, setNote] = useState(props.record.note);
  const [tagText, setTagText] = useState(props.record.tags.join(props.copy.tagSeparator));
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "failed">("idle");

  const tags = parseTags(tagText);
  const dirty = note !== props.record.note
    || tags.join("\u0000") !== props.record.tags.join("\u0000");

  // The controller keeps this popover mounted while there are unsaved edits, so it has to know.
  useEffect(() => {
    props.onDirtyChange?.(dirty);
  }, [dirty]);
  useEffect(() => () => props.onDirtyChange?.(false), []);

  const save = (): void => {
    setSaveStatus("saving");
    void Promise.resolve(props.onSave(props.record.id, note, tags))
      .then(() => setSaveStatus("idle"))
      .catch(() => setSaveStatus("failed"));
  };

  return (
    <>
      <div className="liucai-popover-title">{props.copy.editorTitle}</div>
      <label className="liucai-field-label">{props.copy.note}</label>
      <textarea
        autoFocus={props.focus === "note"}
        maxLength={MAX_NOTE_LENGTH}
        value={note}
        placeholder={props.copy.notePlaceholder}
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
      <label className="liucai-field-label">{props.copy.tags}</label>
      <input
        className="liucai-tag-input"
        autoFocus={props.focus === "tags"}
        value={tagText}
        placeholder={props.copy.tagsPlaceholder}
        onChange={(event) => setTagText(event.currentTarget.value)}
      />
      <div className="liucai-popover-actions">
        <button data-action="cancel" onClick={props.onCancel} disabled={saveStatus === "saving"}>
          {props.copy.cancel}
        </button>
        <button data-action="save" onClick={save} disabled={saveStatus === "saving"}>
          {saveStatus === "saving" ? props.copy.saving : props.copy.save}
        </button>
      </div>
      {saveStatus === "failed" ? (
        <p className="liucai-popover-error" role="alert">{props.copy.saveFailed}</p>
      ) : null}
    </>
  );
}
