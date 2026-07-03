import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("uses a light matching background for each sidebar highlight card", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");

  assert.match(css, /\.liucai-sidebar-item\[data-color="gold"\]\s*\{\s*background:\s*#fffbe6;/i);
  assert.match(css, /\.liucai-sidebar-item\[data-color="mint"\]\s*\{\s*background:\s*#ecfff9;/i);
  assert.match(css, /\.liucai-sidebar-item\[data-color="coral"\]\s*\{\s*background:\s*#fff1ee;/i);
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

test("preserves semantic newlines in sidebar highlight text", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");
  const textRule = css.match(/\.liucai-sidebar-item__text\s*\{[^}]*\}/s)?.[0];

  assert.ok(textRule);
  assert.match(textRule, /white-space:\s*pre-wrap;/);
});

test("styles note paragraphs and Markdown-lite lists", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");

  assert.match(css, /\.liucai-note-paragraph\s*\{[^}]*white-space:\s*pre-wrap;/s);
  assert.match(css, /\.liucai-note-list\s*\{[^}]*padding-left:/s);
  assert.match(css, /\.liucai-note-list li\s*\{[^}]*margin-top:/s);
});

test("keeps tooltip notes and tags consistent with sidebar cards", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");
  const noteRule = css.match(/\.liucai-highlight-tooltip__note\s*\{[^}]*\}/s)?.[0];
  const tagRule = css.match(/\.liucai-highlight-tooltip__tags span\s*\{[^}]*\}/s)?.[0];

  assert.ok(noteRule);
  assert.ok(tagRule);
  assert.match(noteRule, /background:\s*#fff7ed;/i);
  assert.match(noteRule, /color:\s*#92400e;/i);
  assert.match(noteRule, /font:\s*12px\//i);
  assert.match(tagRule, /background:\s*#eff6ff;/i);
  assert.match(tagRule, /color:\s*#2563eb;/i);
  assert.match(tagRule, /font:\s*700 10px\//i);
});

test("styles sidebar action feedback and disabled states", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");

  assert.match(css, /\.liucai-sidebar-item__actions button:disabled\s*\{[^}]*cursor:\s*default;/s);
  assert.match(css, /button\[data-status="copied"\]\s*\{[^}]*color:\s*#2563eb;/s);
  assert.match(css, /button\[data-status="failed"\]\s*\{[^}]*color:\s*#dc2626;/s);
});

test("wraps unbroken highlight and note text inside its container", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");
  const textRule = css.match(/\.liucai-sidebar-item__text\s*\{[^}]*\}/s)?.[0];
  const paragraphRule = css.match(/\.liucai-note-paragraph\s*\{[^}]*\}/s)?.[0];
  const listItemRules = Array.from(
    css.matchAll(/\.liucai-note-list li\s*\{[^}]*\}/gs),
    (match) => match[0],
  );

  assert.ok(textRule);
  assert.ok(paragraphRule);
  assert.match(textRule, /min-width:\s*0;/);
  assert.match(textRule, /overflow-wrap:\s*anywhere;/);
  assert.match(paragraphRule, /overflow-wrap:\s*anywhere;/);
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

test("keeps the original vertical rhythm between note, tags, and card actions", async () => {
  const css = await readFile(new URL("../public/content.css", import.meta.url), "utf8");
  const noteRule = css.match(/\.liucai-sidebar-item__note\s*\{[^}]*\}/s)?.[0];
  const tagsRule = css.match(/\.liucai-sidebar-item__tags\s*\{[^}]*\}/s)?.[0];
  const actionsRule = css.match(/\.liucai-sidebar-item__actions\s*\{[^}]*\}/s)?.[0];

  assert.ok(noteRule);
  assert.ok(tagsRule);
  assert.ok(actionsRule);
  assert.match(noteRule, /margin:\s*7px 0 0;/);
  assert.match(tagsRule, /margin:\s*11px 0 0;/);
  assert.match(actionsRule, /margin-top:\s*8px;/);
  assert.doesNotMatch(css, /\.liucai-sidebar-item__footer\s*\{/);
});
