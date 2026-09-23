import { ContentMounts } from "./contentMount";
import { ContentTransitionQueue } from "./contentTransitionQueue";
import {
  AiExplanationCard,
  type AiExplanationCardState,
  EditorPopover,
  ExistingHighlightToolbar,
  HighlightSidebar,
  HighlightTooltip,
  LearningToolbar,
  MiniSidebarLauncher,
  SelectionToolbar,
  type EditorFocus,
} from "./contentUi";
import { appendNote, formatAiExplanationNote } from "../ai/aiNote";
import { createSelectorFromRange, LIUCAI_UI_SELECTOR, rangesFromSelectors } from "./domText";
import { applyHighlight, removeHighlightFromDom, updateHighlightAttributes } from "./highlightDom";
import { HoverRequestTracker } from "./hoverRequest";
import { generateUuid } from "../shared/id";
import {
  AI_AUTH_STATE_STORAGE_KEY,
  LOCAL_DATABASE_SCOPE_STORAGE_KEY,
  isAiStreamUpdate,
  isPageStatusRequest,
  isSetSiteDisabledRequest,
  type PageStatus,
  type AiExplanation,
  type AiExample,
  type StorageResponse,
  type SyncStatus,
} from "../shared/messages";
import {
  createObsidianExportFilename,
  formatObsidianHighlight,
  formatObsidianPageExport,
} from "./obsidianExport";
import { getRangeDisplayText } from "./rangeDisplayText";
import { getSelectionContext } from "./selectionContext";
import {
  getContentCopy,
  resolveInterfaceLocale,
  type ContentCopy,
  type ResolvedLocale,
} from "../shared/localization";
import {
  normalizePreferences,
  PREFERENCES_STORAGE_KEY,
} from "../shared/preferences";
import { isHostnameDisabled, setHostnameDisabled } from "../settings/sitePreferences";
import {
  getSelectionToolbarKind,
  getVisibleSelectionToolbarKind,
  type SelectionToolbarKind,
} from "./selectionIntent";
import {
  addHighlight,
  getActiveHighlights,
  getHighlight,
  putHighlight,
  upsertPage,
} from "../storage/storageClient";
import type { HighlightColor, HighlightRecord, PageRecord } from "../shared/types";
import {
  createPageIdentity,
  hasPageIdentityChanged,
  type PageIdentity,
} from "./url";

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

const LIUCAI_POINTER_UI_SELECTOR = `${LIUCAI_UI_SELECTOR},.liucai-highlight-tooltip`;

const LOCATION_CHECK_INTERVAL_MS = 750;
const PAGE_SETTLE_DELAY_MS = 50;

export class ContentController {
  private readonly mounts = new ContentMounts();
  private readonly transitions = new ContentTransitionQueue();
  private readonly hoverRequests = new HoverRequestTracker();
  private readonly hostname = location.hostname;
  private identity: PageIdentity = createPageIdentity(location.href);
  private observedHref = location.href;
  private currentSelectionRange: Range | null = null;
  private sidebarOpen = false;
  private pagePromise: Promise<PageRecord> | null = null;
  private pageActive = false;
  private defaultAnnotationColor: HighlightColor = "gold";
  private interfaceLocale: ResolvedLocale = resolveInterfaceLocale("auto");
  private contentCopy: ContentCopy = getContentCopy(this.interfaceLocale);
  private locationTimer: number | null = null;
  private selectionRequestId = 0;
  private aiRequestId = 0;
  private activeAiModelRequestId: string | null = null;
  private activeAiStreamUpdate: ((text: string) => void) | null = null;
  private mouseDownStartedInUi = false;
  private ignorePageClickUntilMouseDown = false;
  private editorDirty = false;
  private disposed = false;

  async initialize(): Promise<void> {
    chrome.runtime.onMessage.addListener(this.handleRuntimeMessage);
    chrome.storage.onChanged.addListener(this.handleStorageChange);
    window.addEventListener("beforeunload", this.cleanup);
    window.addEventListener("hashchange", this.checkLocation);
    window.addEventListener("popstate", this.checkLocation);
    this.locationTimer = window.setInterval(this.checkLocation, LOCATION_CHECK_INTERVAL_MS);
    await this.transitions.run(() => this.syncActivation());
  }

  private cleanup = (): void => {
    this.disposed = true;
    this.deactivate();
    chrome.runtime.onMessage.removeListener(this.handleRuntimeMessage);
    chrome.storage.onChanged.removeListener(this.handleStorageChange);
    window.removeEventListener("beforeunload", this.cleanup);
    window.removeEventListener("hashchange", this.checkLocation);
    window.removeEventListener("popstate", this.checkLocation);
    if (this.locationTimer !== null) {
      window.clearInterval(this.locationTimer);
      this.locationTimer = null;
    }
  };

  private async syncActivation(): Promise<void> {
    if (this.disposed || await isHostnameDisabled(this.hostname)) {
      this.deactivate();
      return;
    }

    await this.activate();
  }

  private async activate(): Promise<void> {
    if (this.pageActive || this.disposed) {
      return;
    }

    await this.refreshPreferences();
    if (this.disposed || await isHostnameDisabled(this.hostname)) {
      this.deactivate();
      return;
    }

    // Register the listeners and mark the page active *before* the restore calls. Those calls go
    // through the background service worker, and one failed round trip (a cold start, or a
    // just-updated extension) used to leave the tab with no listeners at all — highlighting, the
    // sidebar and the popup's "enabled" badge all lied, with no way to recover short of navigating.
    document.addEventListener("mousedown", this.handleMouseDown, true);
    document.addEventListener("mouseup", this.handleMouseUp, true);
    document.addEventListener("pointercancel", this.clearUiMouseDown, true);
    document.addEventListener("keydown", this.handleKeyDown, true);
    document.addEventListener("click", this.handleDocumentClickEvent, true);
    document.addEventListener("pointerover", this.handleHighlightPointerOver, true);
    document.addEventListener("pointerout", this.handleHighlightPointerOut, true);
    // Capture phase, so scrolling inside a nested container counts too.
    document.addEventListener("scroll", this.handleViewportChange, true);
    window.addEventListener("resize", this.handleViewportChange);
    window.addEventListener("blur", this.clearUiMouseDown);
    this.pageActive = true;

    try {
      await this.restoreHighlights();
      await this.refreshSidebarData(true);
    } catch (error) {
      // Rendering can be retried by the next storage change or navigation; the page stays usable.
      this.reportError("initial highlight restore", error);
    }
  }

  private deactivate(): void {
    document.removeEventListener("mousedown", this.handleMouseDown, true);
    document.removeEventListener("mouseup", this.handleMouseUp, true);
    document.removeEventListener("pointercancel", this.clearUiMouseDown, true);
    document.removeEventListener("keydown", this.handleKeyDown, true);
    document.removeEventListener("click", this.handleDocumentClickEvent, true);
    document.removeEventListener("pointerover", this.handleHighlightPointerOver, true);
    document.removeEventListener("pointerout", this.handleHighlightPointerOut, true);
    document.removeEventListener("scroll", this.handleViewportChange, true);
    window.removeEventListener("resize", this.handleViewportChange);
    window.removeEventListener("blur", this.clearUiMouseDown);
    this.pageActive = false;
    this.sidebarOpen = false;
    this.currentSelectionRange = null;
    this.mouseDownStartedInUi = false;
    this.ignorePageClickUntilMouseDown = false;
    this.aiRequestId += 1;
    this.cancelAiRequest();
    this.hoverRequests.clear();
    this.mounts.hideAll();
    for (const span of Array.from(document.querySelectorAll<HTMLElement>(".liucai-highlight"))) {
      span.replaceWith(...Array.from(span.childNodes));
    }
  }

  private checkLocation = (): void => {
    const nextHref = location.href;
    if (nextHref === this.observedHref) {
      return;
    }

    this.observedHref = nextHref;
    if (!hasPageIdentityChanged(this.identity, nextHref)) {
      this.identity = createPageIdentity(nextHref);
      // switchPage() deactivates before it settles, so a URL that changes to a same-canonical
      // variant inside that window lands here with the page already torn down. Nothing else would
      // bring it back: the next checkLocation() sees href === observedHref and returns at once.
      if (!this.pageActive) {
        void this.transitions
          .run(() => this.syncActivation())
          .catch((error) => this.reportError("page activation", error));
      }
      return;
    }

    void this.transitions
      .run(() => this.switchPage(nextHref))
      .catch((error) => this.reportError("page navigation", error));
  };

  private async switchPage(nextHref: string): Promise<void> {
    if (this.disposed || nextHref !== this.observedHref) {
      return;
    }

    this.deactivate();
    this.identity = createPageIdentity(nextHref);
    this.pagePromise = null;
    await new Promise<void>((resolve) => window.setTimeout(resolve, PAGE_SETTLE_DELAY_MS));

    if (this.disposed) {
      return;
    }
    if (location.href !== nextHref) {
      this.checkLocation();
      return;
    }

    await this.syncActivation();
  }

  private handleStorageChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== "local") {
      return;
    }

    if (changes[PREFERENCES_STORAGE_KEY]) {
      const languageChanged = this.applyPreferences(
        changes[PREFERENCES_STORAGE_KEY].newValue,
      );
      if (languageChanged && this.pageActive) {
        this.aiRequestId += 1;
        this.mounts.hideToolbar();
        if (!this.editorDirty) this.mounts.hidePopover();
        void this.transitions
          .run(() => this.refreshSidebarData())
          .catch((error) => this.reportError("language preference sync", error));
      }
      if (Object.keys(changes).length === 1) return;
    }

    if (changes[AI_AUTH_STATE_STORAGE_KEY]) {
      this.selectionRequestId += 1;
      this.aiRequestId += 1;
      this.currentSelectionRange = null;
      this.mounts.hideToolbar();
      if (!this.editorDirty) this.mounts.hidePopover();
      if (Object.keys(changes).length === 1) return;
    }

    if (changes[LOCAL_DATABASE_SCOPE_STORAGE_KEY]) {
      // A cached page or editor belongs to the previous database. Reusing either after an account
      // switch could create a highlight whose page exists only in another user's local store.
      this.pagePromise = null;
      this.editorDirty = false;
      this.currentSelectionRange = null;
      this.mounts.hideToolbar();
      this.mounts.hidePopover();
    }

    const task = changes["liucai.sync.changedAt"]
      ? () => this.refreshSyncedPage()
      : changes[LOCAL_DATABASE_SCOPE_STORAGE_KEY]
        ? () => this.refreshSyncedPage()
        : () => this.syncActivation();
    void this.transitions
      .run(task)
      .catch((error) => this.reportError("site setting sync", error));
  };

  private async refreshSyncedPage(): Promise<void> {
    if (!this.pageActive || this.disposed) return;
    // The spans are rebuilt below, which would leave a visible tooltip anchored to a removed node.
    this.mounts.hideHighlightTooltip();
    if (this.mounts.hasPopover()) {
      await this.restoreHighlights();
      await this.refreshSidebarData();
      return;
    }
    this.aiRequestId += 1;
    this.mounts.hideToolbar();
    for (const span of Array.from(document.querySelectorAll<HTMLElement>(".liucai-highlight"))) {
      span.replaceWith(...Array.from(span.childNodes));
    }
    await this.restoreHighlights();
    await this.refreshSidebarData();
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      if (this.editorDirty) return;
      this.aiRequestId += 1;
      this.cancelAiRequest();
      this.mounts.hideToolbar();
      this.mounts.hidePopover();
    }
  };

  private getCurrentPage(): Promise<PageRecord> {
    this.pagePromise ??= upsertPage(
      this.identity.canonicalUrl,
      this.identity.href,
      document.title,
    ).catch((error) => {
      this.pagePromise = null;
      throw error;
    });
    return this.pagePromise;
  }

  private async restoreHighlights(): Promise<void> {
    const records = await getActiveHighlights(this.identity.canonicalUrl);
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

  private handleMouseUp = (event: MouseEvent): void => {
    const startedInUi = this.mouseDownStartedInUi;
    if (startedInUi || this.isLiucaiUiTarget(event.target)) {
      window.setTimeout(this.clearUiMouseDown, 0);
      return;
    }
    this.mouseDownStartedInUi = false;

    // Unsaved editor content must only be discarded by its explicit Cancel action.
    if (this.editorDirty) return;

    const requestId = ++this.selectionRequestId;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.toString().trim()) {
      this.currentSelectionRange = null;
      this.mounts.hideToolbar();
      return;
    }

    this.aiRequestId += 1;
    this.mounts.hidePopover();

    this.currentSelectionRange = selection.getRangeAt(0).cloneRange();
    const range = this.currentSelectionRange;
    const kind = getSelectionToolbarKind(
      range,
      document.querySelectorAll<HTMLElement>(".liucai-highlight"),
    );
    this.runAsync("resolve selection toolbar", async () => {
      const signedIn = await this.getAiSignedIn();
      if (requestId !== this.selectionRequestId || !this.isCurrentSelection(range)) return;
      const rect = range.getBoundingClientRect();
      this.showSelectionToolbar(
        kind,
        signedIn,
        rect.left + rect.width / 2,
        Math.max(8, rect.top - 56),
      );
    });
  };

  private handleDocumentClickEvent = (event: MouseEvent): void => {
    const startedInUi = this.mouseDownStartedInUi;
    this.mouseDownStartedInUi = false;
    if (startedInUi || this.ignorePageClickUntilMouseDown) return;
    this.runAsync("handle highlight click", () => this.handleDocumentClick(event));
  };

  private handleMouseDown = (event: MouseEvent): void => {
    this.ignorePageClickUntilMouseDown = false;
    this.mouseDownStartedInUi = this.isLiucaiUiTarget(event.target);
  };

  private clearUiMouseDown = (): void => {
    this.mouseDownStartedInUi = false;
  };

  private isLiucaiUiTarget(target: EventTarget | null): boolean {
    return target instanceof Element && Boolean(target.closest(LIUCAI_POINTER_UI_SELECTOR));
  }

  private handleHighlightPointerOver = (event: PointerEvent): void => {
    const highlight = this.getTooltipHighlight(event.target);
    if (!highlight || this.isInsideHighlight(highlight, event.relatedTarget)) {
      return;
    }

    const id = highlight.dataset.id;
    if (!id) {
      return;
    }

    const request = this.hoverRequests.begin(id);
    this.runAsync("load highlight tooltip", async () => {
      const record = await getHighlight(id);
      if (!this.hoverRequests.isCurrent(request) || !record || record.deletedAt) {
        return;
      }

      const normalized = normalizeHighlightRecord(record);
      if (!normalized.note.trim() && normalized.tags.length === 0) {
        return;
      }
      this.mounts.showHighlightTooltip(
        highlight,
        normalized.color,
        <HighlightTooltip note={normalized.note} tags={normalized.tags} />,
        { x: event.clientX, y: event.clientY },
      );
    });
  };

  private handleHighlightPointerOut = (event: PointerEvent): void => {
    const related = event.relatedTarget instanceof Element ? event.relatedTarget : null;
    if (related?.closest(".liucai-highlight-tooltip")) return;

    const tooltip = (event.target as Element | null)?.closest?.(".liucai-highlight-tooltip");
    if (tooltip) {
      if (!related?.closest(".liucai-highlight-tooltip")) this.mounts.hideHighlightTooltip();
      return;
    }

    const highlight = this.getTooltipHighlight(event.target);
    if (!highlight || this.isInsideHighlight(highlight, event.relatedTarget)) {
      return;
    }
    const id = highlight.dataset.id;
    if (id) {
      this.hoverRequests.clear(id);
    }
    this.mounts.hideHighlightTooltip();
  };

  /**
   * A fixed-position tooltip does not follow its anchor when the page scrolls or the window resizes,
   * and the browser delivers no pointerout for either. Hide it rather than leave it floating over
   * unrelated content until the pointer happens to move.
   */
  private handleViewportChange = (event: Event): void => {
    if (event.target instanceof Element && event.target.closest(".liucai-highlight-tooltip")) {
      return;
    }
    this.mounts.hideHighlightTooltip();
  };

  /**
   * Closing the AI card only made the content script ignore the answer; the model kept generating
   * until it finished or the timeout fired.
   */
  private cancelAiRequest(): void {
    const requestId = this.activeAiModelRequestId;
    if (!requestId) return;
    this.activeAiModelRequestId = null;
    this.activeAiStreamUpdate = null;
    void chrome.runtime.sendMessage({ type: "LIUCAI_AI_CANCEL", requestId }).catch(() => undefined);
  }

  private async handleDocumentClick(event: MouseEvent): Promise<void> {
    const target = event.target as Element | null;
    if (this.isLiucaiUiTarget(target)) {
      return;
    }
    if (this.editorDirty) return;

    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim()) {
      return;
    }

    this.aiRequestId += 1;
    this.cancelAiRequest();
    // The dirty-editor guard above makes Cancel and Save the only ways to discard pending edits.
    this.mounts.hidePopover();

    const highlightEl = target?.closest?.(".liucai-highlight") as HTMLElement | null;
    if (!highlightEl) return;

    const id = highlightEl.dataset.id;
    if (!id || this.shouldAllowNativeClick(event, target, highlightEl)) return;

    event.preventDefault();
    event.stopPropagation();

    const record = await getHighlight(id);
    if (!record || record.deletedAt) return;

    const rect = highlightEl.getBoundingClientRect();
    this.showHighlightToolbar(
      normalizeHighlightRecord(record),
      rect.left + rect.width / 2,
      Math.max(8, rect.top - 54),
    );
  }

  private shouldAllowNativeClick(
    event: MouseEvent,
    target: Element | null,
    highlightEl: HTMLElement,
  ): boolean {
    if (
      event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) {
      return true;
    }

    const interactive = target?.closest?.(INTERACTIVE_CONTENT_SELECTOR);
    return Boolean(interactive && interactive.contains(highlightEl));
  }

  private showSelectionToolbar(
    kind: SelectionToolbarKind,
    signedIn: boolean,
    centerX: number,
    top: number,
  ): void {
    const visibleKind = getVisibleSelectionToolbarKind(kind, signedIn);
    if (!visibleKind) {
      this.mounts.hideToolbar();
      return;
    }

    if (visibleKind === "learn") {
      this.mounts.showToolbar(
        centerX,
        top,
        36,
        "liucai-toolbar--learning",
        <LearningToolbar copy={this.contentCopy} onAi={this.handleAiSelection} />,
      );
      return;
    }

    this.mounts.showToolbar(
      centerX,
      top,
      signedIn ? 202 : 164,
      "liucai-toolbar--selection",
      <SelectionToolbar
        copy={this.contentCopy}
        onAi={signedIn ? this.handleAiSelection : undefined}
        onColor={(color) => this.runAsync(
          "create highlight",
          () => this.createHighlight(color, { openEditor: false }),
        )}
        onNote={() => this.runAsync(
          "create note highlight",
          () => this.createHighlight(
            this.defaultAnnotationColor,
            { openEditor: true, focus: "note" },
          ),
        )}
        onTags={() => this.runAsync(
          "create tagged highlight",
          () => this.createHighlight(
            this.defaultAnnotationColor,
            { openEditor: true, focus: "tags" },
          ),
        )}
      />,
    );
  }

  private handleAiSelection = (): void => {
    if (this.editorDirty) return;
    const range = this.currentSelectionRange?.cloneRange();
    if (!range) return;

    const selectedText = getRangeDisplayText(range).trim() || range.toString().trim();
    if (!selectedText) return;
    const contextText = getSelectionContext(range);
    const rect = range.getBoundingClientRect();
    const highlightIds = this.getIntersectingHighlightIds(range);
    const requestId = ++this.aiRequestId;
    let popoverNode: HTMLElement | null = null;
    this.mounts.hideToolbar();
    window.getSelection()?.removeAllRanges();

    const render = (state: AiExplanationCardState): void => {
      if (requestId !== this.aiRequestId) return;
      const explanation = state.status === "success" ? state.explanation : null;
      const content = <AiExplanationCard
          copy={this.contentCopy}
          subject={selectedText}
          state={state}
          canAppend={highlightIds.length <= 1}
          onLoadExample={async (onUpdate) => {
            if (!explanation) throw new Error("AI_EXPLANATION_MISSING");
            const modelRequestId = generateUuid();
            this.activeAiModelRequestId = modelRequestId;
            this.activeAiStreamUpdate = onUpdate;
            const response = await chrome.runtime.sendMessage({
              type: "LIUCAI_AI_EXAMPLE",
              requestId: modelRequestId,
              selectedText: selectedText.slice(0, 1500),
              contextText: contextText.slice(0, 2500),
              concept: explanation.concept,
              locale: this.interfaceLocale,
            }).finally(() => {
              if (this.activeAiModelRequestId === modelRequestId) {
                this.activeAiModelRequestId = null;
                this.activeAiStreamUpdate = null;
              }
            }) as StorageResponse<AiExample> | undefined;
            if (!response?.ok) throw new Error(response?.error ?? "AI_REQUEST_FAILED");
            return response.data.example;
          }}
          onAppend={async (example) => {
            if (!explanation) return;
            await this.appendAiExplanation(range, highlightIds, explanation, example);
          }}
          onRetry={() => request()}
          onClose={() => {
            this.aiRequestId += 1;
            this.cancelAiRequest();
            this.mounts.hidePopover();
          }}
        />;
      const node = popoverNode?.isConnected
        ? this.mounts.updatePopover(content) ?? popoverNode
        : this.mounts.showPopover(
          rect.left,
          rect.bottom + 8,
          content,
          "liucai-ai-popover",
        );
      popoverNode = node;
      this.mounts.fitPopoverInViewport(node);
    };

    const request = (): void => {
      render({ status: "loading" });
      const modelRequestId = generateUuid();
      this.activeAiModelRequestId = modelRequestId;
      this.activeAiStreamUpdate = (text) => {
        if (requestId === this.aiRequestId) render({ status: "streaming", explanation: text });
      };
      void chrome.runtime.sendMessage({
        type: "LIUCAI_AI_EXPLAIN",
        requestId: modelRequestId,
        selectedText: selectedText.slice(0, 1500),
        contextText: contextText.slice(0, 2500),
        locale: this.interfaceLocale,
      }).then((response: StorageResponse<AiExplanation> | undefined) => {
        if (requestId !== this.aiRequestId) return;
        if (!response?.ok) {
          render({ status: "error", error: response?.error ?? "AI_REQUEST_FAILED" });
          return;
        }
        render({ status: "success", explanation: response.data });
      }).catch((error) => {
        render({ status: "error", error: this.stringifyError(error) });
      }).finally(() => {
        if (this.activeAiModelRequestId === modelRequestId) {
          this.activeAiModelRequestId = null;
          this.activeAiStreamUpdate = null;
        }
      });
    };

    request();
  };

  private getIntersectingHighlightIds(range: Range): string[] {
    const ids = new Set<string>();
    for (const highlight of document.querySelectorAll<HTMLElement>(".liucai-highlight[data-id]")) {
      try {
        if (range.intersectsNode(highlight) && highlight.dataset.id) ids.add(highlight.dataset.id);
      } catch {
        // Ignore detached nodes while the host page is updating its DOM.
      }
    }
    return [...ids];
  }

  private async appendAiExplanation(
    range: Range,
    highlightIds: string[],
    explanation: AiExplanation,
    example?: string,
  ): Promise<void> {
    if (highlightIds.length > 1) throw new Error("AI_NOTE_MULTIPLE_HIGHLIGHTS");
    const note = formatAiExplanationNote(explanation, this.interfaceLocale, example);

    if (highlightIds.length === 1) {
      const record = await getHighlight(highlightIds[0]);
      if (!record || record.deletedAt) throw new Error("AI_NOTE_TARGET_MISSING");
      const updated: HighlightRecord = {
        ...normalizeHighlightRecord(record),
        note: appendNote(record.note, note),
        updatedAt: new Date().toISOString(),
      };
      await putHighlight(updated);
      updateHighlightAttributes(updated);
      await this.refreshSidebarData();
      return;
    }

    this.currentSelectionRange = range.cloneRange();
    await this.createHighlight(this.defaultAnnotationColor, {
      openEditor: false,
      initialNote: note,
    });
  }

  private async getAiSignedIn(): Promise<boolean> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "LIUCAI_SYNC_GET_STATUS",
      }) as StorageResponse<SyncStatus> | undefined;
      return Boolean(response?.ok && response.data.signedIn);
    } catch (error) {
      this.reportError("AI login status", error);
      return false;
    }
  }

  private isCurrentSelection(range: Range): boolean {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;
    const current = selection.getRangeAt(0);
    return current.startContainer === range.startContainer
      && current.startOffset === range.startOffset
      && current.endContainer === range.endContainer
      && current.endOffset === range.endOffset;
  }

  private async refreshPreferences(): Promise<void> {
    try {
      const stored = await chrome.storage.local.get(PREFERENCES_STORAGE_KEY);
      this.applyPreferences(stored[PREFERENCES_STORAGE_KEY]);
    } catch (error) {
      this.defaultAnnotationColor = "gold";
      this.interfaceLocale = resolveInterfaceLocale("auto");
      this.contentCopy = getContentCopy(this.interfaceLocale);
      this.reportError("preferences load", error);
    }
  }

  private applyPreferences(value: unknown): boolean {
    const preferences = normalizePreferences(value);
    const nextLocale = resolveInterfaceLocale(preferences.general.interfaceLanguage);
    const languageChanged = nextLocale !== this.interfaceLocale;
    this.defaultAnnotationColor = preferences.highlights.defaultAnnotationColor;
    this.interfaceLocale = nextLocale;
    this.contentCopy = getContentCopy(nextLocale);
    return languageChanged;
  }

  private showHighlightToolbar(
    record: HighlightRecord,
    centerX: number,
    top: number,
  ): void {
    this.mounts.showToolbar(
      centerX,
      top,
      164,
      "liucai-toolbar--highlight",
      <ExistingHighlightToolbar
        copy={this.contentCopy}
        record={record}
        onColor={(color) => this.runAsync(
          "update highlight color",
          () => this.updateHighlightColor(record.id, color),
        )}
        onNote={() => this.showEditorPopover(record, centerX - 140, top + 54, "note")}
        onTags={() => this.showEditorPopover(record, centerX - 140, top + 54, "tags")}
        onCopy={() => this.runAsync(
          "copy highlight text",
          () => this.copyHighlightText(record),
        )}
        onDelete={() => this.runAsync(
          "delete highlight",
          () => this.deleteHighlight(record.id),
        )}
      />,
    );
  }

  private showEditorPopover(
    record: HighlightRecord,
    left: number,
    top: number,
    focus: EditorFocus = "note",
  ): void {
    this.ignorePageClickUntilMouseDown = true;
    this.editorDirty = false;
    const safeRecord = normalizeHighlightRecord(record);
    const node = this.mounts.showPopover(
      left,
      top,
      <EditorPopover
        copy={this.contentCopy}
        record={safeRecord}
        focus={focus}
        onDirtyChange={(dirty) => {
          this.editorDirty = dirty;
        }}
        onCancel={() => {
          this.editorDirty = false;
          this.mounts.hidePopover();
        }}
        onSave={(id, note, tags) => this.saveHighlightMeta(id, note, tags)}
      />,
    );
    this.mounts.fitPopoverInViewport(node);
  }

  /**
   * `force` belongs to the activation path, which renders before it flips `pageActive`. Every
   * other caller arrives after an `await`, so it must confirm the page is still live: a late IPC
   * reply used to remount the mini sidebar on a page that had already been deactivated, including
   * on a site the user had just disabled from the popup.
   */
  private async refreshSidebarData(force = false): Promise<void> {
    const records = await getActiveHighlights(this.identity.canonicalUrl);
    if (this.disposed || (!force && !this.pageActive)) {
      return;
    }
    this.renderMiniSidebar(records.length);
    if (this.sidebarOpen) {
      this.renderSidebar(records);
    }
  }

  private renderMiniSidebar(count: number): void {
    this.mounts.renderMiniSidebar(
      <MiniSidebarLauncher
        copy={this.contentCopy}
        count={count}
        open={this.sidebarOpen}
        onToggle={() => this.runAsync("toggle sidebar", () => this.toggleSidebar())}
      />,
    );
  }

  private async toggleSidebar(): Promise<void> {
    if (this.disposed || !this.pageActive) {
      return;
    }
    if (this.sidebarOpen) {
      this.mounts.hideSidebar();
      this.sidebarOpen = false;
      await this.refreshSidebarData();
      return;
    }

    this.sidebarOpen = true;
    await this.refreshSidebarData();
  }

  private renderSidebar(records: HighlightRecord[]): void {
    this.mounts.renderSidebar(
      <HighlightSidebar
        copy={this.contentCopy}
        pageTitle={document.title}
        records={records}
        onClose={() => {
          this.sidebarOpen = false;
          this.mounts.hideSidebar();
          this.runAsync("refresh mini sidebar", () => this.refreshSidebarData());
        }}
        onExport={() => this.exportHighlights(records)}
        onLocate={(id) => this.locateHighlight(id)}
        onEdit={(record) => this.editHighlightFromSidebar(record)}
        onCopy={(record) => this.runReported(
          "copy sidebar highlight text",
          () => this.copyHighlightText(record),
        )}
        onDelete={(id) => this.runReported(
          "delete sidebar highlight",
          () => this.deleteHighlight(id),
        )}
      />,
    );
  }

  private locateHighlight(id: string): void {
    const span = this.getHighlightSpans(id)[0];
    if (!span) return;
    span.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    span.classList.add("liucai-highlight--focused");
    window.setTimeout(() => span.classList.remove("liucai-highlight--focused"), 1400);
  }

  private editHighlightFromSidebar(record: HighlightRecord): void {
    this.mounts.hideToolbar();
    this.showEditorPopover(record, window.innerWidth - 690, 88, "note");
  }

  private async createHighlight(
    color: HighlightColor,
    options: { openEditor: boolean; focus?: EditorFocus; initialNote?: string },
  ): Promise<void> {
    if (options.openEditor) {
      this.ignorePageClickUntilMouseDown = true;
    }
    const range = this.currentSelectionRange;
    this.mounts.hideToolbar();
    window.getSelection()?.removeAllRanges();

    if (!range) return;
    const selector = createSelectorFromRange(range);
    if (!selector) return;
    const displayText = getRangeDisplayText(range);

    // Freeze the page identity before awaiting. Otherwise a navigation landing during the round trip
    // pairs the old page id with the new canonical url, and the span gets wrapped into a range that
    // is no longer in the document — an invisible highlight plus a record that points at two pages.
    const canonicalUrl = this.identity.canonicalUrl;
    const page = await this.getCurrentPage();
    if (this.disposed || !this.pageActive || this.identity.canonicalUrl !== canonicalUrl) {
      this.currentSelectionRange = null;
      return;
    }

    const now = new Date().toISOString();
    const highlight: HighlightRecord = {
      id: generateUuid(),
      pageId: page.id,
      canonicalUrl,
      text: displayText || selector.exact,
      color,
      note: options.initialNote ?? "",
      tags: [],
      selector,
      createdAt: now,
      updatedAt: now,
    };

    const spans = applyHighlight(range, highlight);
    if (spans.length === 0) {
      console.warn("[六彩] create highlight skipped: no DOM spans were created");
      this.currentSelectionRange = null;
      return;
    }

    try {
      await addHighlight(highlight);
    } catch (error) {
      removeHighlightFromDom(highlight.id);
      throw error;
    }

    const rect = spans[0]?.getBoundingClientRect() ?? range.getBoundingClientRect();
    this.currentSelectionRange = null;

    if (options.openEditor) {
      this.showEditorPopover(
        highlight,
        rect.left,
        rect.bottom + 8,
        options.focus ?? "note",
      );
    }
    await this.refreshSidebarData();
  }

  private async saveHighlightMeta(
    id: string,
    note: string,
    tags: string[],
  ): Promise<void> {
    const record = await getHighlight(id);
    // Throw rather than returning quietly: the popover shows a failure state from this rejection.
    if (!record) throw new Error(`HIGHLIGHT_NOT_FOUND:${id}`);

    const updated: HighlightRecord = {
      ...normalizeHighlightRecord(record),
      note,
      tags,
      updatedAt: new Date().toISOString(),
    };
    await putHighlight(updated);
    updateHighlightAttributes(updated);
    this.editorDirty = false;
    this.mounts.hidePopover();
    await this.refreshSidebarData();
  }

  private async updateHighlightColor(
    id: string,
    color: HighlightColor,
  ): Promise<void> {
    const record = await getHighlight(id);
    if (!record) throw new Error(`HIGHLIGHT_NOT_FOUND:${id}`);

    const updated: HighlightRecord = {
      ...normalizeHighlightRecord(record),
      color,
      updatedAt: new Date().toISOString(),
    };
    await putHighlight(updated);
    for (const span of this.getHighlightSpans(id)) {
      span.dataset.color = color;
    }
    this.mounts.hideToolbar();
    await this.refreshSidebarData();
  }

  private async copyHighlightText(record: HighlightRecord): Promise<void> {
    await this.copyText(formatObsidianHighlight(record, document.title));
  }

  private async exportHighlights(records: HighlightRecord[]): Promise<void> {
    if (records.length === 0) {
      return;
    }

    const markdown = formatObsidianPageExport({
      pageTitle: document.title,
      canonicalUrl: this.identity.canonicalUrl,
      highlights: records,
    });
    this.downloadTextFile(
      createObsidianExportFilename(document.title),
      markdown,
      "text/markdown;charset=utf-8",
    );
  }

  private downloadTextFile(filename: string, text: string, type: string): void {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private async copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      console.warn(
        "[六彩] navigator.clipboard.writeText failed, falling back to execCommand",
        error,
      );
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

  private async deleteHighlight(id: string): Promise<void> {
    const record = await getHighlight(id);
    // Throw rather than returning quietly: the sidebar waits on this promise, and a silent
    // "success" left its delete button stuck on "deleting" with both buttons disabled.
    if (!record) throw new Error(`HIGHLIGHT_NOT_FOUND:${id}`);

    const now = new Date().toISOString();
    await putHighlight({
      ...normalizeHighlightRecord(record),
      deletedAt: now,
      updatedAt: now,
    });
    removeHighlightFromDom(id);
    this.mounts.hideToolbar();
    this.mounts.hidePopover();
    await this.refreshSidebarData();
  }

  private handleRuntimeMessage = (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ): boolean | undefined => {
    if (sender.id === chrome.runtime.id && isAiStreamUpdate(message)) {
      if (message.requestId === this.activeAiModelRequestId) {
        this.activeAiStreamUpdate?.(message.text);
      }
      return undefined;
    }

    if (isPageStatusRequest(message)) {
      void this.transitions
        .run(() => this.getPageStatus())
        .then(sendResponse)
        .catch((error) => {
          this.reportError("popup status", error);
          sendResponse({ ok: false, error: this.stringifyError(error) });
        });
      return true;
    }

    if (isSetSiteDisabledRequest(message)) {
      void this.transitions
        .run(async () => {
          await setHostnameDisabled(this.hostname, message.disabled);
          await this.syncActivation();
          return this.getPageStatus();
        })
        .then(sendResponse)
        .catch((error) => {
          this.reportError("site disabled update", error);
          sendResponse({ ok: false, error: this.stringifyError(error) });
        });
      return true;
    }

    return undefined;
  };

  private async getPageStatus(): Promise<PageStatus> {
    const [records, disabled] = await Promise.all([
      getActiveHighlights(this.identity.canonicalUrl),
      isHostnameDisabled(this.hostname),
    ]);

    return {
      ok: true,
      canonicalUrl: this.identity.canonicalUrl,
      hostname: this.hostname,
      title: document.title,
      highlightCount: records.length,
      noteCount: records.filter((record) => record.note.trim().length > 0).length,
      tagCount: new Set(records.flatMap((record) => record.tags.map((tag) => tag.trim()).filter(Boolean))).size,
      maskCount: 0,
      disabled,
    };
  }

  private getHighlightSpans(id: string): HTMLElement[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        `.liucai-highlight[data-id="${CSS.escape(id)}"]`,
      ),
    );
  }

  private getTooltipHighlight(target: EventTarget | null): HTMLElement | null {
    const highlight = (target as Element | null)?.closest?.(".liucai-highlight") as HTMLElement | null;
    if (!highlight) {
      return null;
    }
    if (highlight.dataset.hasNote === "true" || highlight.dataset.hasTags === "true") {
      return highlight;
    }
    return null;
  }

  private isInsideHighlight(
    highlight: HTMLElement,
    target: EventTarget | null,
  ): boolean {
    if (!(target instanceof Node)) {
      return false;
    }
    if (highlight.contains(target)) {
      return true;
    }
    const id = highlight.dataset.id;
    if (!id || !(target instanceof Element)) {
      return false;
    }
    const other = target.closest(".liucai-highlight");
    return other instanceof HTMLElement && other.dataset.id === id;
  }

  private runAsync(label: string, task: () => Promise<void>): void {
    void task().catch((error) => this.reportError(label, error));
  }

  private async runReported(
    label: string,
    task: () => Promise<void>,
  ): Promise<void> {
    try {
      await task();
    } catch (error) {
      this.reportError(label, error);
      throw error;
    }
  }

  private reportError(scope: string, error: unknown): void {
    console.warn(`[六彩] ${scope} failed:`, error);
  }

  private stringifyError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

function normalizeHighlightRecord(record: HighlightRecord): HighlightRecord {
  // Every consumer trims `note` directly (the note editor, the Obsidian export, the sidebar), so a
  // record stored before that field existed must not reach them as undefined.
  return {
    ...record,
    note: typeof record.note === "string" ? record.note : "",
    tags: Array.isArray(record.tags) ? record.tags : [],
  };
}
