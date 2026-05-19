import type { HighlightRecord } from "./types";

export function applyHighlight(range: Range, highlight: HighlightRecord): HTMLElement[] {
  const spans: HTMLElement[] = [];
  const textNodes = collectTextNodes(range);

  for (const node of textNodes) {
    const selectedRange = document.createRange();
    selectedRange.selectNodeContents(node);

    if (node === range.startContainer) {
      selectedRange.setStart(node, range.startOffset);
    }
    if (node === range.endContainer) {
      selectedRange.setEnd(node, range.endOffset);
    }

    if (!selectedRange.toString()) {
      continue;
    }

    const span = document.createElement("span");
    span.className = "liucai-highlight";
    span.dataset.id = highlight.id;
    span.dataset.color = highlight.color;
    span.dataset.hasNote = String(Boolean(highlight.note.trim()));
    span.dataset.hasTags = String(Array.isArray(highlight.tags) && highlight.tags.length > 0);

    try {
      selectedRange.surroundContents(span);
      spans.push(span);
    } catch (error) {
      console.warn("[六彩] surroundContents failed, using extract/insert fallback", error);
      try {
        const fragment = selectedRange.extractContents();
        span.append(fragment);
        selectedRange.insertNode(span);
        spans.push(span);
      } catch (fallbackError) {
        console.warn("[六彩] highlight fallback failed", fallbackError);
      }
    }
  }

  if (spans.length > 0) {
    spans[spans.length - 1].classList.add("liucai-highlight--last");
    syncTooltipAttr(spans[spans.length - 1], highlight);
  }

  return spans;
}

function syncTooltipAttr(span: HTMLElement, highlight: HighlightRecord): void {
  const parts: string[] = [];
  const note = highlight.note.trim();
  const tags = Array.isArray(highlight.tags) ? highlight.tags : [];
  if (note) parts.push(note);
  if (tags.length > 0) parts.push(tags.map((t) => `#${t}`).join(" "));
  span.dataset.tooltip = parts.length > 0 ? parts.join("\n\n") : "";
}

/** Update data-tooltip and hasNote/hasTags on all spans for a given record. */
export function updateHighlightAttributes(record: HighlightRecord): void {
  for (const span of Array.from(
    document.querySelectorAll<HTMLElement>(`.liucai-highlight[data-id="${CSS.escape(record.id)}"]`),
  )) {
    span.dataset.hasNote = String(Boolean(record.note.trim()));
    span.dataset.hasTags = String(Array.isArray(record.tags) && record.tags.length > 0);
    if (span.classList.contains("liucai-highlight--last")) {
      syncTooltipAttr(span, record);
    }
  }
}

export function removeHighlightFromDom(id: string): void {
  for (const span of Array.from(document.querySelectorAll<HTMLElement>(`.liucai-highlight[data-id="${CSS.escape(id)}"]`))) {
    span.replaceWith(...Array.from(span.childNodes));
  }
}

function collectTextNodes(range: Range): Text[] {
  if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
    return [range.startContainer as Text];
  }

  const common = range.commonAncestorContainer;
  const walker = document.createTreeWalker(common, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }
  return nodes;
}
