import type { HighlightSelector } from "./types";

const IGNORED_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION"]);
const LIUCAI_UI_SELECTOR = [
  ".liucai-toolbar",
  ".liucai-popover",
  ".liucai-sidebar-root",
  ".liucai-mini-sidebar-root",
  ".liucai-sidebar",
  ".liucai-mini-sidebar",
].join(",");

export interface TextNodeEntry {
  node: Text;
  start: number;
  end: number;
}

interface DocumentTextSnapshot {
  entries: TextNodeEntry[];
  text: string;
}

export function getTextNodes(root: Node = document.body): TextNodeEntry[] {
  return getTextSnapshot(root).entries;
}

export function getDocumentText(): string {
  return getTextSnapshot().text;
}

function getTextSnapshot(root: Node = document.body): DocumentTextSnapshot {
  const entries: TextNodeEntry[] = [];
  const parts: string[] = [];
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || IGNORED_TAGS.has(parent.tagName) || parent.closest(LIUCAI_UI_SELECTOR)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (!node.nodeValue) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const value = node.nodeValue ?? "";
    entries.push({ node, start: offset, end: offset + value.length });
    parts.push(value);
    offset += value.length;
  }

  return { entries, text: parts.join("") };
}

export function createSelectorFromRange(range: Range): HighlightSelector | null {
  const exact = range.toString();
  if (!exact.trim()) {
    return null;
  }

  const snapshot = getTextSnapshot();
  const startEntry = snapshot.entries.find((entry) => entry.node === range.startContainer);
  const endEntry = snapshot.entries.find((entry) => entry.node === range.endContainer);

  if (!startEntry || !endEntry) {
    return null;
  }

  const start = startEntry.start + range.startOffset;
  const end = endEntry.start + range.endOffset;

  return {
    exact,
    prefix: snapshot.text.slice(Math.max(0, start - 80), start),
    suffix: snapshot.text.slice(end, Math.min(snapshot.text.length, end + 80)),
    start,
    end,
  };
}

export function rangesFromSelectors(selectors: HighlightSelector[]): Array<Range | null> {
  const snapshot = getTextSnapshot();
  return selectors.map((selector) => rangeFromSelectorWithSnapshot(selector, snapshot));
}

export function rangeFromSelector(selector: HighlightSelector): Range | null {
  return rangeFromSelectorWithSnapshot(selector, getTextSnapshot());
}

function rangeFromSelectorWithSnapshot(selector: HighlightSelector, snapshot: DocumentTextSnapshot): Range | null {
  let start = selector.start;
  let end = selector.end;

  if (snapshot.text.slice(start, end) !== selector.exact) {
    const candidates = findAllOccurrences(snapshot.text, selector.exact);
    const best = candidates
      .map((candidateStart) => {
        const candidateEnd = candidateStart + selector.exact.length;
        const prefix = snapshot.text.slice(Math.max(0, candidateStart - selector.prefix.length), candidateStart);
        const suffix = snapshot.text.slice(candidateEnd, candidateEnd + selector.suffix.length);
        return {
          start: candidateStart,
          end: candidateEnd,
          score: similarity(prefix, selector.prefix) + similarity(suffix, selector.suffix),
        };
      })
      .sort((a, b) => b.score - a.score)[0];

    if (!best || best.score < 0.2) {
      return null;
    }
    start = best.start;
    end = best.end;
  }

  return rangeFromOffsets(start, end, snapshot.entries);
}

function rangeFromOffsets(start: number, end: number, entries: TextNodeEntry[]): Range | null {
  const startEntry = entries.find((entry) => start >= entry.start && start <= entry.end);
  const endEntry = entries.find((entry) => end >= entry.start && end <= entry.end);

  if (!startEntry || !endEntry) {
    return null;
  }

  const range = document.createRange();
  range.setStart(startEntry.node, start - startEntry.start);
  range.setEnd(endEntry.node, end - endEntry.start);
  return range;
}

function findAllOccurrences(text: string, query: string): number[] {
  if (!query) return [];
  const result: number[] = [];
  let index = text.indexOf(query);
  while (index !== -1) {
    result.push(index);
    index = text.indexOf(query, index + Math.max(1, query.length));
  }
  return result;
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  return longer.includes(shorter) ? shorter.length / longer.length : 0;
}
