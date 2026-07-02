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
