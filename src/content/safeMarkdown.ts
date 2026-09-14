import { createElement, type ReactNode } from "react";

type Block =
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; start: number; items: string[] }
  | { type: "quote"; children: Block[] }
  | { type: "code"; lang: string; text: string };

const UNORDERED = /^-\s(.*)$/;
const ORDERED = /^(\d+)\.\s(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const FENCE_OPEN = /^( {0,3})(`{3,})(.*)$/;
const LANG = /^[a-zA-Z0-9_+-]+$/;
const WORD = /[\p{L}\p{N}]/u;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const SPECIAL = "*`\\";
// Nested quotes recurse in both parse and render, so a page of ">" characters would otherwise
// blow the call stack on input as small as 2 KB.
const MAX_QUOTE_DEPTH = 8;

export function SafeMarkdown(props: { children: string }) {
  return createElement("div", { className: "liucai-markdown" }, renderBlocks(parseBlocks(props.children)));
}

function parseBlocks(source: string, depth = 0): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const opening = fenceOpening(line);
    if (opening) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !isFenceClose(lines[index], opening.markerLength)) {
        body.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const lang = LANG.test(opening.info) ? opening.info : "";
      blocks.push({ type: "code", lang, text: body.join("\n") });
      continue;
    }

    const unordered = line.match(UNORDERED);
    if (unordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(UNORDERED);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push({ type: "list", ordered: false, start: 1, items });
      continue;
    }

    const ordered = line.match(ORDERED);
    if (ordered) {
      const items: string[] = [];
      const start = Number.parseInt(ordered[1], 10);
      while (index < lines.length) {
        const item = lines[index].match(ORDERED);
        if (!item) break;
        items.push(item[2]);
        index += 1;
      }
      blocks.push({ type: "list", ordered: true, start, items });
      continue;
    }

    const quote = line.match(QUOTE);
    if (quote) {
      const quoted: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(QUOTE);
        if (!item) break;
        quoted.push(item[1]);
        index += 1;
      }
      const quotedText = quoted.join("\n");
      const children: Block[] = depth + 1 < MAX_QUOTE_DEPTH
        ? parseBlocks(quotedText, depth + 1)
        : [{ type: "paragraph", text: quotedText }];
      blocks.push({ type: "quote", children });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const next = lines[index];
      if (next.trim() === "") break;
      if (fenceOpening(next) || UNORDERED.test(next) || ORDERED.test(next) || QUOTE.test(next)) break;
      paragraph.push(next);
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join("\n") });
  }

  return blocks;
}

/**
 * The opening of a fenced code block, or null when the line merely looks like one.
 *
 * A backtick fence's info string may not contain a backtick (CommonMark §4.5), so a line such as
 * ```js``` is ordinary text. Treating it as a fence used to swallow the whole line into an empty
 * code block, which silently dropped content.
 */
function fenceOpening(line: string): { markerLength: number; info: string } | null {
  const match = line.match(FENCE_OPEN);
  if (!match || match[3].includes("`")) return null;
  return { markerLength: match[2].length, info: match[3].trim() };
}

function isFenceClose(line: string, openLength: number): boolean {
  const close = line.match(/^( {0,3})(`{3,})\s*$/);
  return Boolean(close && close[2].length >= openLength);
}

function renderBlocks(blocks: Block[]): ReactNode[] {
  return blocks.map((block, index) => renderBlock(block, index));
}

function renderBlock(block: Block, index: number): ReactNode {
  const key = String(index);
  if (block.type === "list") {
    return createElement(
      block.ordered ? "ol" : "ul",
      block.ordered && block.start !== 1 ? { key, start: block.start } : { key },
      block.items.map((item, itemIndex) => createElement("li", { key: itemIndex }, parseInline(item))),
    );
  }
  if (block.type === "quote") {
    return createElement("blockquote", { key }, renderBlocks(block.children));
  }
  if (block.type === "code") {
    return createElement(
      "pre",
      { key },
      createElement("code", block.lang ? { className: `language-${block.lang}` } : null, block.text),
    );
  }
  return createElement("p", { key }, parseInline(block.text));
}

function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let buffer = "";
  let index = 0;
  // A failed scan knows something reusable: if no closing marker exists from position P to the
  // end of the line, no later start can succeed either, so later scans skip the line walk
  // instead of rescanning it (keeps delimiter-dense text linear instead of quadratic).
  let strongClosedAfter = -1;
  let emClosedAfter = -1;

  const flush = (): void => {
    if (buffer) {
      nodes.push(buffer);
      buffer = "";
    }
  };

  const findStrongClose = (from: number): number => {
    if (strongClosedAfter >= 0 && from >= strongClosedAfter) return -1;
    const close = findEmphasisClose(text, from, 2);
    if (close === -1) strongClosedAfter = from;
    return close;
  };

  const findEmClose = (from: number): number => {
    if (emClosedAfter >= 0 && from >= emClosedAfter) return -1;
    const close = findEmphasisClose(text, from, 1);
    if (close === -1) emClosedAfter = from;
    return close;
  };

  while (index < text.length) {
    if (text[index] === "\\" && index + 1 < text.length && SPECIAL.includes(text[index + 1])) {
      buffer += text[index + 1];
      index += 2;
      continue;
    }

    if (text[index] === "`") {
      const close = findClose(text, index + 1, "`");
      if (close === -1 || close === index + 1) {
        buffer += "`";
        index += 1;
        continue;
      }
      flush();
      nodes.push(createElement("code", { key: nodes.length }, text.slice(index + 1, close)));
      index = close + 1;
      continue;
    }

    if (text[index] === "*") {
      // Consume the asterisk literally when it cannot open emphasis, so a marker that stays
      // literal is never reinterpreted as a shorter one (which can mangle delimiter runs).
      if (markerRunLength(text, index) === 2 && canOpenEmphasis(text, index, 2)) {
        const close = findStrongClose(index + 2);
        if (close !== -1) {
          flush();
          nodes.push(createElement("strong", { key: nodes.length }, text.slice(index + 2, close)));
          index = close + 2;
          continue;
        }
      } else if (markerRunLength(text, index) === 1 && canOpenEmphasis(text, index, 1)) {
        const close = findEmClose(index + 1);
        if (close !== -1) {
          flush();
          nodes.push(createElement("em", { key: nodes.length }, text.slice(index + 1, close)));
          index = close + 1;
          continue;
        }
      }
      buffer += text[index];
      index += 1;
      continue;
    }

    buffer += text[index];
    index += 1;
  }

  flush();
  return nodes;
}

function canOpenEmphasis(text: string, index: number, markerLength: number): boolean {
  const after = text[index + markerLength];
  if (!after || /\s/.test(after)) {
    return false;
  }
  const before = index > 0 ? text[index - 1] : "";
  if (!(WORD.test(before) && WORD.test(after))) return true;
  // Chinese prose normally has no spaces around emphasis markers. Permit that common authoring
  // style while preserving literal markers inside Latin identifiers such as a**b**c.
  return CJK.test(before) || CJK.test(after);
}

function findEmphasisClose(text: string, from: number, markerLength: number): number {
  let index = from;
  while (index < text.length) {
    if (text[index] === "\\" && index + 1 < text.length) {
      index += 2;
      continue;
    }
    // This decision depends only on this position, never on where the scan started. That is what
    // makes "nothing closes from here on" safe to cache for every later start position; the old
    // check against `from` broke that monotonicity and poisoned the cache for the rest of the line.
    if (markerRunLength(text, index) === markerLength && canCloseEmphasis(text, index)) {
      return index;
    }
    index += 1;
  }
  return -1;
}

/**
 * 1 or 2 when an asterisk run of exactly that length starts at this position, otherwise 0.
 *
 * A run of three or more is not a marker: with no nested emphasis to pair it with, splitting it
 * (as the old code did) both mis-rendered the run itself and made every later scan fail.
 */
function markerRunLength(text: string, index: number): number {
  if (text[index] !== "*" || text[index - 1] === "*") return 0;
  if (text[index + 1] !== "*") return 1;
  return text[index + 2] === "*" ? 0 : 2;
}

function canCloseEmphasis(text: string, index: number): boolean {
  const before = index > 0 ? text[index - 1] : "";
  return Boolean(before) && !/\s/.test(before);
}

function findClose(text: string, from: number, marker: string): number {
  return text.indexOf(marker, from);
}
