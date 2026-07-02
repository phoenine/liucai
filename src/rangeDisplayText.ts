export type DisplayTextToken =
  | { type: "text"; value: string }
  | { type: "boundary" };

const DISPLAY_BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "THEAD",
  "TR",
  "UL",
]);

export function isDisplayBlockTag(tagName: string): boolean {
  return DISPLAY_BLOCK_TAGS.has(tagName.toUpperCase());
}

export function formatDisplayTextTokens(tokens: DisplayTextToken[]): string {
  let result = "";
  let boundaryPending = false;

  for (const token of tokens) {
    if (token.type === "boundary") {
      boundaryPending = result.length > 0;
      continue;
    }

    let value = token.value;
    if (boundaryPending) {
      if (!value.trim()) {
        continue;
      }
      result = result.replace(/[ \t]+$/u, "");
      value = value.replace(/^[ \t]+/u, "");
      if (result && value && !result.endsWith("\n") && !value.startsWith("\n")) {
        result += "\n";
      }
    }
    result += value;
    boundaryPending = false;
  }

  return result.trim();
}

export function getRangeDisplayText(range: Range): string {
  const tokens: DisplayTextToken[] = [];
  collectDisplayTextTokens(range.cloneContents(), tokens);
  return formatDisplayTextTokens(tokens);
}

function collectDisplayTextTokens(node: Node, tokens: DisplayTextToken[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    tokens.push({ type: "text", value: node.nodeValue ?? "" });
    return;
  }

  if (node instanceof Element) {
    if (node.tagName === "BR") {
      tokens.push({ type: "boundary" });
      return;
    }
    if (isDisplayBlockTag(node.tagName)) {
      tokens.push({ type: "boundary" });
    }
  }

  for (const child of Array.from(node.childNodes)) {
    collectDisplayTextTokens(child, tokens);
  }

  if (node instanceof Element && isDisplayBlockTag(node.tagName)) {
    tokens.push({ type: "boundary" });
  }
}
