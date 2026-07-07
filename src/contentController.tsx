import { ContentMounts } from "./contentMount";
import { ContentTransitionQueue } from "./contentTransitionQueue";
import {
  EditorPopover,
  ExistingHighlightToolbar,
  HighlightSidebar,
  HighlightTooltip,
  MiniSidebarLauncher,
  SelectionToolbar,
  type EditorFocus,
} from "./contentUi";
import { db, getActiveHighlights, normalizeHighlightRecord, upsertPage } from "./db";
import { createSelectorFromRange, rangesFromSelectors } from "./domText";
import { applyHighlight, removeHighlightFromDom, updateHighlightAttributes } from "./highlightDom";
import { HoverRequestTracker } from "./hoverRequest";
import { generateUuid } from "./id";
import {
  isPageStatusRequest,
  isSetSiteDisabledRequest,
  type PageStatus,
} from "./messages";
import {
  createObsidianExportFilename,
  formatObsidianHighlight,
  formatObsidianPageExport,
} from "./obsidianExport";
import { getRangeDisplayText } from "./rangeDisplayText";
import { isHostnameDisabled, setHostnameDisabled } from "./sitePreferences";
import type { HighlightColor, HighlightRecord, PageRecord } from "./types";
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
  private locationTimer: number | null = null;
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

    await this.getCurrentPage();
    await this.restoreHighlights();
    await this.refreshSidebarData();

    if (this.disposed || await isHostnameDisabled(this.hostname)) {
      this.deactivate();
      return;
    }

    document.addEventListener("mouseup", this.handleMouseUp, true);
    document.addEventListener("keydown", this.handleKeyDown, true);
    document.addEventListener("click", this.handleDocumentClickEvent, true);
    document.addEventListener("pointerover", this.handleHighlightPointerOver, true);
    document.addEventListener("pointerout", this.handleHighlightPointerOut, true);
    this.pageActive = true;
  }

  private deactivate(): void {
    document.removeEventListener("mouseup", this.handleMouseUp, true);
    document.removeEventListener("keydown", this.handleKeyDown, true);
    document.removeEventListener("click", this.handleDocumentClickEvent, true);
    document.removeEventListener("pointerover", this.handleHighlightPointerOver, true);
    document.removeEventListener("pointerout", this.handleHighlightPointerOut, true);
    this.pageActive = false;
    this.sidebarOpen = false;
    this.currentSelectionRange = null;
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
    _changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== "local") {
      return;
    }

    void this.transitions
      .run(() => this.syncActivation())
      .catch((error) => this.reportError("site setting sync", error));
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
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
    if (
      (event.target as Element | null)?.closest?.(
        ".liucai-toolbar,.liucai-popover,.liucai-sidebar,.liucai-mini-sidebar,.liucai-highlight",
      )
    ) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.toString().trim()) {
      this.mounts.hideToolbar();
      return;
    }

    this.currentSelectionRange = selection.getRangeAt(0).cloneRange();
    const rect = this.currentSelectionRange.getBoundingClientRect();
    this.showSelectionToolbar(rect.left + rect.width / 2, Math.max(8, rect.top - 56));
  };

  private handleDocumentClickEvent = (event: MouseEvent): void => {
    this.runAsync("handle highlight click", () => this.handleDocumentClick(event));
  };

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
      const record = await db.highlights.get(id);
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
      );
    });
  };

  private handleHighlightPointerOut = (event: PointerEvent): void => {
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

  private async handleDocumentClick(event: MouseEvent): Promise<void> {
    const target = event.target as Element | null;
    if (
      target?.closest?.(
        ".liucai-toolbar,.liucai-popover,.liucai-sidebar,.liucai-mini-sidebar",
      )
    ) {
      return;
    }

    const highlightEl = target?.closest?.(".liucai-highlight") as HTMLElement | null;
    if (!highlightEl) return;

    const id = highlightEl.dataset.id;
    if (!id || this.shouldAllowNativeClick(event, target, highlightEl)) return;

    event.preventDefault();
    event.stopPropagation();

    const record = await db.highlights.get(id);
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

  private showSelectionToolbar(centerX: number, top: number): void {
    this.mounts.showToolbar(
      centerX,
      top,
      164,
      "liucai-toolbar--selection",
      <SelectionToolbar
        onColor={(color) => this.runAsync(
          "create highlight",
          () => this.createHighlight(color, { openEditor: false }),
        )}
        onNote={() => this.runAsync(
          "create note highlight",
          () => this.createHighlight("gold", { openEditor: true, focus: "note" }),
        )}
        onTags={() => this.runAsync(
          "create tagged highlight",
          () => this.createHighlight("gold", { openEditor: true, focus: "tags" }),
        )}
      />,
    );
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
    const safeRecord = normalizeHighlightRecord(record);
    const node = this.mounts.showPopover(
      left,
      top,
      <EditorPopover
        record={safeRecord}
        focus={focus}
        onCancel={() => this.mounts.hidePopover()}
        onSave={(id, note, tags) => this.runAsync(
          "save highlight meta",
          () => this.saveHighlightMeta(id, note, tags),
        )}
      />,
    );
    this.mounts.fitPopoverInViewport(node);
  }

  private async refreshSidebarData(): Promise<void> {
    const records = await getActiveHighlights(this.identity.canonicalUrl);
    this.renderMiniSidebar(records.length);
    if (this.sidebarOpen) {
      this.renderSidebar(records);
    }
  }

  private renderMiniSidebar(count: number): void {
    this.mounts.renderMiniSidebar(
      <MiniSidebarLauncher
        count={count}
        open={this.sidebarOpen}
        onToggle={() => this.runAsync("toggle sidebar", () => this.toggleSidebar())}
      />,
    );
  }

  private async toggleSidebar(): Promise<void> {
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
    options: { openEditor: boolean; focus?: EditorFocus },
  ): Promise<void> {
    const range = this.currentSelectionRange;
    this.mounts.hideToolbar();
    window.getSelection()?.removeAllRanges();

    if (!range) return;
    const selector = createSelectorFromRange(range);
    if (!selector) return;
    const displayText = getRangeDisplayText(range);

    const page = await this.getCurrentPage();
    const now = new Date().toISOString();
    const highlight: HighlightRecord = {
      id: generateUuid(),
      pageId: page.id,
      canonicalUrl: this.identity.canonicalUrl,
      text: displayText || selector.exact,
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
      this.currentSelectionRange = null;
      return;
    }

    try {
      await db.highlights.add(highlight);
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
    const record = await db.highlights.get(id);
    if (!record) return;

    const updated: HighlightRecord = {
      ...normalizeHighlightRecord(record),
      note,
      tags,
      updatedAt: new Date().toISOString(),
    };
    await db.highlights.put(updated);
    updateHighlightAttributes(updated);
    this.mounts.hidePopover();
    await this.refreshSidebarData();
  }

  private async updateHighlightColor(
    id: string,
    color: HighlightColor,
  ): Promise<void> {
    const record = await db.highlights.get(id);
    if (!record) return;

    const updated: HighlightRecord = {
      ...normalizeHighlightRecord(record),
      color,
      updatedAt: new Date().toISOString(),
    };
    await db.highlights.put(updated);
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
    const record = await db.highlights.get(id);
    if (!record) return;

    const now = new Date().toISOString();
    await db.highlights.put({
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
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ): boolean | undefined => {
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
    return (target as Element | null)?.closest?.(
      '.liucai-highlight--last:is([data-has-note="true"],[data-has-tags="true"])',
    ) as HTMLElement | null;
  }

  private isInsideHighlight(
    highlight: HTMLElement,
    target: EventTarget | null,
  ): boolean {
    return target instanceof Node && highlight.contains(target);
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
