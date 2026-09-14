import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  HIGHLIGHT_ACCENT,
  HIGHLIGHT_MARKER,
  HIGHLIGHT_SOFT,
} from "../src/highlightTooltip.ts";

test("uses a light matching background for each sidebar highlight card", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");

  assert.match(css, /\.liucai-sidebar-item\[data-color\]\s*\{\s*background:\s*var\(--liucai-soft\);/);
  assert.match(css, /\.liucai-sidebar-item\[data-color\] \.liucai-sidebar-item__line,\s*\.liucai-sidebar-item\[data-color\] \.liucai-sidebar-item__dot\s*\{[^}]*background:\s*var\(--liucai-accent\);/s);
  for (const color of Object.keys(HIGHLIGHT_SOFT) as Array<keyof typeof HIGHLIGHT_SOFT>) {
    assert.match(
      css,
      new RegExp(
        String.raw`\.liucai-highlight-tooltip\[data-color="${color}"\],\s*` +
          String.raw`\.liucai-sidebar-item\[data-color="${color}"\]\s*\{` +
          String.raw`[^}]*--liucai-soft:\s*${HIGHLIGHT_SOFT[color]};` +
          String.raw`[^}]*--liucai-accent:\s*${HIGHLIGHT_ACCENT[color]};` +
          String.raw`[^}]*--liucai-marker:\s*${HIGHLIGHT_MARKER[color]};`,
        "i",
      ),
    );
  }
});

test("keeps wrapped article highlights as one marker instead of cloned chips", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");
  const rule = css.match(/\.liucai-highlight\s*\{[^}]*\}/s)?.[0];

  assert.ok(rule);
  assert.doesNotMatch(rule, /box-decoration-break:\s*clone/i);
  assert.doesNotMatch(rule, /padding:\s*0 1px/);
  assert.match(rule, /padding:\s*0\.08em 0;/);
});

test("shows complete highlight text and notes in sidebar cards", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");
  const textRule = css.match(/\.liucai-sidebar-item__text\s*\{[^}]*\}/s)?.[0];
  const noteRule = css.match(/\.liucai-sidebar-item__note\s*\{[^}]*\}/s)?.[0];

  assert.ok(textRule);
  assert.ok(noteRule);
  assert.doesNotMatch(textRule, /(?:line-clamp|overflow:\s*hidden)/);
  assert.doesNotMatch(noteRule, /(?:line-clamp|overflow:\s*hidden)/);
});

test("visually separates readable sidebar notes from excerpt text", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");
  const ui = await readFile(new URL("../src/contentUi.tsx", import.meta.url), "utf8");
  const textRule = css.match(/\.liucai-sidebar-item__text\s*\{[^}]*\}/s)?.[0];
  const noteRule = css.match(/\.liucai-sidebar-item__note\s*\{[^}]*\}/s)?.[0];
  const stampRule = css.match(/\.liucai-sidebar-item__note-stamp\s*\{[^}]*\}/s)?.[0];

  assert.ok(textRule);
  assert.ok(noteRule);
  assert.ok(stampRule);
  assert.match(textRule, /font:\s*13\.5px\/1\.55/);
  assert.match(noteRule, /background:\s*rgba\(255, 255, 255, 0\.55\);/);
  assert.match(noteRule, /border-radius:\s*7px;/);
  assert.doesNotMatch(noteRule, /border:/);
  assert.match(noteRule, /color:\s*#273244;/i);
  assert.match(noteRule, /font:\s*13px\/1\.6/);
  assert.match(noteRule, /padding:\s*20px 9px 8px;/);
  assert.match(noteRule, /position:\s*relative;/);
  assert.match(stampRule, /background:\s*var\(--liucai-marker\);/);
  assert.match(stampRule, /height:\s*18px;/);
  assert.match(stampRule, /pointer-events:\s*none;/);
  assert.match(stampRule, /position:\s*absolute;/);
  assert.match(stampRule, /top:\s*-4px;/);
  assert.match(stampRule, /width:\s*18px;/);
  assert.doesNotMatch(css, /\.liucai-sidebar-item__note-(?:label|body)/);
  assert.match(ui, /<section aria-label={props\.copy\.note} className="liucai-sidebar-item__note">/);
  assert.match(ui, /<span aria-hidden="true" className="liucai-sidebar-item__note-stamp">注<\/span>/);
});

test("uses the plugin slate palette for the sidebar export action", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");
  const buttonRule = css.match(/\.liucai-sidebar__export button\s*\{[^}]*\}/s)?.[0];
  const hoverRule = css.match(/\.liucai-sidebar__export button:hover\s*\{[^}]*\}/s)?.[0];

  assert.ok(buttonRule);
  assert.ok(hoverRule);
  assert.match(buttonRule, /background:\s*#475569;/i);
  assert.match(hoverRule, /background:\s*#334155;/i);
});

test("preserves semantic newlines in sidebar highlight text", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");
  const textRule = css.match(/\.liucai-sidebar-item__text\s*\{[^}]*\}/s)?.[0];

  assert.ok(textRule);
  assert.match(textRule, /white-space:\s*pre-wrap;/);
});

test("styles shared Markdown paragraphs, lists, and code", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");

  assert.match(css, /\.liucai-markdown p\s*\{[^}]*white-space:\s*pre-wrap;/s);
  assert.match(css, /\.liucai-markdown :is\(ul, ol\)\s*\{[^}]*padding-left:/s);
  assert.match(css, /\.liucai-markdown li\s*\{[^}]*margin-top:/s);
  assert.match(css, /\.liucai-markdown pre\s*\{[^}]*overflow-x:\s*auto;/s);
});

test("keeps the selected AI subject compact in the card header", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");
  const titleRule = css.match(/\.liucai-ai-card__title\s*\{[^}]*\}/s)?.[0];
  const subjectRule = css.match(/\.liucai-ai-card__title span\s*\{[^}]*\}/s)?.[0];

  assert.ok(titleRule);
  assert.ok(subjectRule);
  assert.match(titleRule, /overflow:\s*hidden;/);
  assert.match(subjectRule, /text-overflow:\s*ellipsis;/);
  assert.match(subjectRule, /white-space:\s*nowrap;/);
  assert.doesNotMatch(css, /\.liucai-ai-card h3\s*\{/);
});

test("keeps tooltip notes and tags consistent with sidebar cards", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");
  const noteRule = css.match(/\.liucai-highlight-tooltip__note\s*\{[^}]*\}/s)?.[0];
  const tagRule = css.match(/\.liucai-highlight-tooltip__tags span\s*\{[^}]*\}/s)?.[0];

  assert.ok(noteRule);
  assert.ok(tagRule);
  assert.match(css, /\.liucai-highlight-tooltip\s*\{[^}]*pointer-events:\s*auto;/s);
  assert.match(noteRule, /background:\s*transparent;/i);
  assert.match(noteRule, /pointer-events:\s*none;/i);
  assert.match(noteRule, /color:\s*#273244;/i);
  assert.match(noteRule, /font:\s*13px\/1\.6/i);
  assert.match(tagRule, /background:\s*#edf2f7;/i);
  assert.match(tagRule, /color:\s*#4f6b8a;/i);
  assert.match(tagRule, /font:\s*700 10px\//i);
  assert.match(
    css,
    /\.liucai-highlight-tooltip \.liucai-markdown li::marker,\s*\.liucai-sidebar-item__note \.liucai-markdown li::marker\s*\{[^}]*color:\s*var\(--liucai-marker\);/s,
  );
});

test("styles sidebar action feedback and disabled states", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");

  assert.match(css, /\.liucai-sidebar-item__actions button:disabled\s*\{[^}]*cursor:\s*default;/s);
  assert.match(css, /button\[data-status="copied"\]\s*\{[^}]*color:\s*#2563eb;/s);
  assert.match(css, /button\[data-status="failed"\]\s*\{[^}]*color:\s*#dc2626;/s);
});

test("keeps the AI toolbar button background consistent with other actions", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");
  const aiRule = css.match(/\.liucai-icon-button--ai\s*\{[^}]*\}/s)?.[0];

  assert.ok(aiRule);
  assert.match(aiRule, /background:\s*#ffffff;/i);
  assert.match(aiRule, /color:\s*#475569;/i);
  assert.doesNotMatch(aiRule, /#7c3aed|#6d28d9/i);
});

test("gives AI card actions restrained press feedback", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");
  const transitionRule = css.match(/\.liucai-ai-card__actions button\s*\{[^}]*\}/s)?.[0];
  const activeRule = css.match(/\.liucai-ai-card__actions button:not\(:disabled\):active\s*\{[^}]*\}/s)?.[0];

  assert.ok(transitionRule);
  assert.ok(activeRule);
  assert.match(transitionRule, /transform 140ms cubic-bezier\(0\.23, 1, 0\.32, 1\)/);
  assert.match(activeRule, /transform:\s*scale\(0\.97\);/);
  assert.match(css, /prefers-reduced-motion:[^)]+\)[^{]*\{[\s\S]*\.liucai-ai-card__actions button\s*\{\s*transition:\s*opacity 100ms ease;/);
  assert.match(css, /prefers-reduced-motion:[\s\S]*\.liucai-ai-card__actions button:not\(:disabled\):active\s*\{[^}]*transform:\s*none;/);
});

test("uses the sourced Phosphor chat icon without adding a DOM component", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");

  assert.match(css, /Phosphor Icons: ChatCircleDots, regular weight/);
  assert.match(css, /data:image\/svg\+xml/i);
  assert.match(css, /viewBox='0 0 256 256'/);
});

test("wraps unbroken highlight and note text inside its container", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");
  const textRule = css.match(/\.liucai-sidebar-item__text\s*\{[^}]*\}/s)?.[0];
  const markdownRule = css.match(/\.liucai-markdown\s*\{[^}]*\}/s)?.[0];
  const listItemRules = Array.from(
    css.matchAll(/\.liucai-markdown li\s*\{[^}]*\}/gs),
    (match) => match[0],
  );

  assert.ok(textRule);
  assert.ok(markdownRule);
  assert.match(textRule, /min-width:\s*0;/);
  assert.match(textRule, /overflow-wrap:\s*anywhere;/);
  assert.match(markdownRule, /overflow-wrap:\s*anywhere;/);
  assert.equal(
    listItemRules.some((rule) => /overflow-wrap:\s*anywhere;/.test(rule)),
    true,
  );
});

test("uses the selected narrow rail layout for sidebar cards", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");
  const cardRule = css.match(/\.liucai-sidebar-item\s*\{[^}]*\}/s)?.[0];
  const railRule = css.match(/\.liucai-sidebar-item__rail\s*\{[^}]*\}/s)?.[0];
  const lineRule = css.match(/\.liucai-sidebar-item__line\s*\{[^}]*\}/s)?.[0];
  const noteRule = css.match(/\.liucai-sidebar-item__note\s*\{[^}]*\}/s)?.[0];
  const tagsRule = css.match(/\.liucai-sidebar-item__tags\s*\{[^}]*\}/s)?.[0];

  assert.ok(cardRule);
  assert.ok(railRule);
  assert.ok(lineRule);
  assert.ok(noteRule);
  assert.ok(tagsRule);
  assert.match(cardRule, /grid-template-columns:\s*28px minmax\(0,\s*1fr\);/);
  assert.match(cardRule, /gap:\s*9px;/);
  assert.match(railRule, /flex-direction:\s*column;/);
  assert.match(lineRule, /flex:\s*1;/);
  assert.match(lineRule, /width:\s*2px;/);
  assert.doesNotMatch(noteRule, /44px/);
  assert.doesNotMatch(tagsRule, /44px/);
});

test("uses a compact page heading and divider above the highlight list", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");
  const headingRule = css.match(/\.liucai-sidebar__heading\s*\{[^}]*\}/s)?.[0];
  const countRule = css.match(/\.liucai-sidebar__count\s*\{[^}]*\}/s)?.[0];
  const titleRule = css.match(/\.liucai-sidebar__page-title\s*\{[^}]*\}/s)?.[0];
  const dividerRule = css.match(/\.liucai-sidebar__divider\s*\{[^}]*\}/s)?.[0];

  assert.ok(headingRule);
  assert.ok(countRule);
  assert.ok(titleRule);
  assert.ok(dividerRule);
  assert.match(headingRule, /display:\s*flex;/);
  assert.match(countRule, /border-radius:\s*999px;/);
  assert.match(titleRule, /text-overflow:\s*ellipsis;/);
  assert.match(dividerRule, /linear-gradient/);
});

test("keeps compact vertical rhythm between note, tags, and card actions", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");
  const noteRule = css.match(/\.liucai-sidebar-item__note\s*\{[^}]*\}/s)?.[0];
  const tagsRule = css.match(/\.liucai-sidebar-item__tags\s*\{[^}]*\}/s)?.[0];
  const actionsRule = css.match(/\.liucai-sidebar-item__actions\s*\{[^}]*\}/s)?.[0];

  assert.ok(noteRule);
  assert.ok(tagsRule);
  assert.ok(actionsRule);
  assert.match(noteRule, /margin:\s*10px 0 0;/);
  assert.match(tagsRule, /margin:\s*8px 0 0;/);
  assert.match(actionsRule, /margin-top:\s*8px;/);
  assert.doesNotMatch(css, /\.liucai-sidebar-item__footer\s*\{/);
});
