import { isDisplayBlockTag } from "./domTags.ts";
import type { HighlightRecord } from "../shared/types";

export function applyHighlight(range: Range, highlight: HighlightRecord): HTMLElement[] {
  const groups = groupTextNodesByBlock(collectTextNodes(range));
  const spans: HTMLElement[] = [];

  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];
    const piece = rangeFromGroup(group, range);
    const wrapped = piece ? wrapRange(piece, highlight) : [];
    spans.unshift(...wrapped);
  }

  for (let index = spans.length - 1; index >= 0; index -= 1) {
    if (spans[index].textContent?.trim()) {
      spans[index].classList.add("liucai-highlight--last");
      break;
    }
  }

  return spans;
}

/** Update the tooltip-presence flags on every span belonging to a record. */
export function updateHighlightAttributes(record: HighlightRecord): void {
  for (const span of Array.from(
    document.querySelectorAll<HTMLElement>(`.liucai-highlight[data-id="${CSS.escape(record.id)}"]`),
  )) {
    setHighlightFlags(span, record);
    // Older builds cached the note and tags in this attribute; drop it so a page's DOM never
    // keeps a readable copy of private highlight content.
    span.removeAttribute("data-tooltip");
  }
}

export function removeHighlightFromDom(id: string): void {
  for (const span of Array.from(document.querySelectorAll<HTMLElement>(`.liucai-highlight[data-id="${CSS.escape(id)}"]`))) {
    span.replaceWith(...Array.from(span.childNodes));
  }
}

function setHighlightFlags(span: HTMLElement, highlight: HighlightRecord): void {
  span.dataset.hasNote = String(Boolean(highlight.note.trim()));
  span.dataset.hasTags = String(Array.isArray(highlight.tags) && highlight.tags.length > 0);
}

function createHighlightSpan(highlight: HighlightRecord): HTMLElement {
  const span = document.createElement("span");
  span.className = "liucai-highlight";
  span.dataset.id = highlight.id;
  span.dataset.color = highlight.color;
  setHighlightFlags(span, highlight);
  return span;
}

function wrapRange(range: Range, highlight: HighlightRecord): HTMLElement[] {
  if (!range.toString().trim()) {
    return [];
  }

  const span = createHighlightSpan(highlight);
  try {
    range.surroundContents(span);
    return [span];
  } catch {
    return wrapTextNodes(range, highlight);
  }
}

function wrapTextNodes(range: Range, highlight: HighlightRecord): HTMLElement[] {
  const spans: HTMLElement[] = [];

  for (const node of collectTextNodes(range)) {
    const selectedRange = document.createRange();
    selectedRange.selectNodeContents(node);

    if (node === range.startContainer) {
      selectedRange.setStart(node, range.startOffset);
    }
    if (node === range.endContainer) {
      selectedRange.setEnd(node, range.endOffset);
    }

    if (!selectedRange.toString().trim()) {
      continue;
    }

    const span = createHighlightSpan(highlight);
    try {
      selectedRange.surroundContents(span);
      spans.push(span);
    } catch (fallbackError) {
      console.warn("[六彩] highlight fallback failed", fallbackError);
    }
  }

  return spans;
}

function rangeFromGroup(group: Text[], origin: Range): Range | null {
  if (group.length === 0) {
    return null;
  }

  const first = group[0];
  const last = group[group.length - 1];
  const piece = document.createRange();
  piece.setStart(first, first === origin.startContainer ? origin.startOffset : 0);
  piece.setEnd(last, last === origin.endContainer ? origin.endOffset : last.length);
  return piece;
}

function groupTextNodesByBlock(nodes: Text[]): Text[][] {
  const groups: Text[][] = [];
  let currentBlock: Element | null = null;
  let currentGroup: Text[] = [];

  for (const node of nodes) {
    const block = closestDisplayBlock(node);
    if (currentGroup.length > 0 && block !== currentBlock) {
      groups.push(currentGroup);
      currentGroup = [];
    }
    currentBlock = block;
    currentGroup.push(node);
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

function closestDisplayBlock(node: Node): Element | null {
  let element = node instanceof Element ? node : node.parentElement;
  while (element && element !== document.body && !isDisplayBlockTag(element.tagName)) {
    element = element.parentElement;
  }
  return element;
}

function collectTextNodes(range: Range): Text[] {
  if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
    return [range.startContainer as Text];
  }

  const common = range.commonAncestorContainer;
  const walker = document.createTreeWalker(common, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }
  return nodes;
}
