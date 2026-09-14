const CONTEXT_CONTAINER_SELECTOR = "p,li,blockquote,pre,td,th,figcaption,h1,h2,h3,h4,h5,h6";

export function getSelectionContext(range: Range, maxLength = 2000): string {
  const node = range.commonAncestorContainer;
  const element = node.nodeType === Node.ELEMENT_NODE
    ? node as Element
    : node.parentElement;
  const container = element?.closest(CONTEXT_CONTAINER_SELECTOR) ?? element;
  const text = normalizeWhitespace(container?.textContent ?? range.toString());
  return trimContextAroundSelection(text, normalizeWhitespace(range.toString()), maxLength);
}

export function trimContextAroundSelection(
  fullText: string,
  selectedText: string,
  maxLength: number,
): string {
  const normalized = normalizeWhitespace(fullText);
  if (normalized.length <= maxLength) return normalized;
  const selectionIndex = normalized.indexOf(selectedText);
  const center = selectionIndex >= 0
    ? selectionIndex + Math.floor(selectedText.length / 2)
    : Math.floor(normalized.length / 2);
  const start = Math.max(0, Math.min(normalized.length - maxLength, center - Math.floor(maxLength / 2)));
  return normalized.slice(start, start + maxLength).trim();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
