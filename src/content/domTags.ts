/**
 * Elements that start a block of their own.
 *
 * Everything else counts as inline content — including unknown and custom elements, which HTML
 * lays out inline by default. The highlight range splitter and the display-text extractor share
 * this one list so the two can never disagree about how a tag is classified; keeping a second
 * "inline tags" list alongside it is what makes such a pair drift apart.
 */
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

/**
 * True when the tag starts a block of its own.
 *
 * Tag names are upper-cased because HTML reports them that way while SVG and MathML elements
 * keep their authored casing (`svg`, `linearGradient`) — and those are inline content anyway.
 */
export function isDisplayBlockTag(tagName: string): boolean {
  return DISPLAY_BLOCK_TAGS.has(tagName.toUpperCase());
}
