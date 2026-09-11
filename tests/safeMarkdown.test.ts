import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SafeMarkdown } from "../src/safeMarkdown.ts";

function html(source: string): string {
  return renderToStaticMarkup(createElement(SafeMarkdown, { children: source }));
}

test("renders AI and note Markdown without rendering raw HTML or links", () => {
  const markup = html("Use **feedback**, *iterate*, and `retry`. <script>alert(1)</script> [source](https://example.com)");

  assert.match(markup, /<strong>feedback<\/strong>/);
  assert.match(markup, /<em>iterate<\/em>/);
  assert.match(markup, /<code>retry<\/code>/);
  assert.match(markup, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(markup, /<script|<a /);
  assert.match(markup, /\[source\]\(https:\/\/example.com\)/);
});

test("keeps angle-bracket and HTML-comment text that CommonMark treats as HTML", () => {
  const typed = html("const x: Array<string> = []; vector<int> v; TS: Promise<Array<number>>");
  const commented = html("<!-- todo -->remember this");

  assert.match(typed, /Array&lt;string&gt;/);
  assert.match(typed, /vector&lt;int&gt;/);
  assert.match(typed, /Promise&lt;Array&lt;number&gt;&gt;/);
  assert.match(commented, /&lt;!-- todo --&gt;remember this/);
  assert.doesNotMatch(typed, /<string>|<int>|<number>/);
});

test("renders lists and fenced code, and shows unsupported heading syntax as text", () => {
  const markup = html("## 结论\n\n1. 检查输出\n2. 修正结果\n\n```ts\nconst ok = true;\n```");

  assert.match(markup, /<p>## 结论<\/p>/);
  assert.doesNotMatch(markup, /<h[1-6]/);
  assert.match(markup, /<ol>/);
  assert.match(markup, /<li>检查输出<\/li>/);
  assert.match(markup, /<pre><code class="language-ts">const ok = true;/);
});

test("keeps link and image syntax as text instead of creating nodes", () => {
  const markup = html("See [docs](https://example.com) and ![diagram](https://example.com/x.png).");

  assert.match(markup, /\[docs\]\(https:\/\/example.com\)/);
  assert.match(markup, /!\[diagram\]\(https:\/\/example.com\/x.png\)/);
  assert.doesNotMatch(markup, /<a |<img /);
});

test("leaves unclosed emphasis and code markers visible", () => {
  const markup = html("see **bold and `code and trailing *star");

  assert.match(markup, /\*\*bold/);
  assert.match(markup, /`code/);
  assert.match(markup, /\*star/);
  assert.doesNotMatch(markup, /<strong>|<em>|<code>/);
});

test("renders quotes, keeps fence emphasis literal, and does not nest lists", () => {
  const markup = html("> remember this\n\n```\nuse **stars**\n```\n\n- a\n- - b");

  assert.match(markup, /<blockquote><p>remember this<\/p><\/blockquote>/);
  assert.match(markup, /use \*\*stars\*\*/);
  assert.doesNotMatch(markup, /<pre>[\s\S]*<strong>/);
  assert.match(markup, /<ul><li>a<\/li><li>- b<\/li><\/ul>/);
  assert.doesNotMatch(markup, /<li>[\s\S]*<ul>/);
});

test("keeps long note text intact", () => {
  const source = `${"字".repeat(4000)}\n\n- item`;
  const markup = html(source);

  assert.match(markup, new RegExp(`<p>${"字".repeat(4000)}<\\/p>`));
  assert.match(markup, /<li>item<\/li>/);
});

test("does not turn star lists or multiplication into emphasis", () => {
  const list = html("* 第一项\n* 第二项");
  const math = html("面积 = 长 * 宽，周长 = 2 * (长 + 宽)");
  const product = html("2*3*4");

  assert.doesNotMatch(list, /<em>/);
  assert.match(list, /\* 第一项/);
  assert.match(list, /\* 第二项/);
  assert.doesNotMatch(math, /<em>/);
  assert.match(math, /长 \* 宽/);
  assert.doesNotMatch(product, /<em>/);
  assert.match(product, /2\*3\*4/);
});

test("leaves escaped markers and empty marker pairs as visible text", () => {
  const escaped = html("\\*2\\* 不是斜体");
  const emptyCode = html("他说 `` 这个符号");
  const emptyStrong = html("****");

  assert.doesNotMatch(escaped, /<em>/);
  assert.match(escaped, /\*2\* 不是斜体/);
  assert.doesNotMatch(emptyCode, /<code>/);
  assert.match(emptyCode, /``/);
  assert.doesNotMatch(emptyStrong, /<strong>/);
  assert.match(emptyStrong, /\*\*\*\*/);
});

test("closes longer fences and re-parses blocks inside quotes", () => {
  const fence = html("````\ncode\n```\nstill\n````");
  const quotedCode = html("> ```\n> x\n> ```");
  const quotedList = html("> - item");

  assert.match(fence, /<pre><code>code\n```\nstill<\/code><\/pre>/);
  assert.doesNotMatch(fence, /<p>/);
  assert.match(quotedCode, /<blockquote><pre><code>x<\/code><\/pre><\/blockquote>/);
  assert.doesNotMatch(quotedCode, /<p>/);
  assert.match(quotedList, /<blockquote><ul><li>item<\/li><\/ul><\/blockquote>/);
});

test("keeps emphasis markers literal when they sit inside a word", () => {
  const cjk = html("这是**重点**内容");
  const latin = html("a**b**c");

  assert.match(cjk, /这是\*\*重点\*\*内容/);
  assert.doesNotMatch(cjk, /<strong>|<em>/);
  assert.match(latin, /a\*\*b\*\*c/);
  assert.doesNotMatch(latin, /<strong>|<em>/);
});

test("parses delimiter-dense text without rescanning the line per marker", () => {
  const source = "*a ".repeat(4000);
  const started = Date.now();
  const markup = html(source);
  const elapsed = Date.now() - started;

  assert.match(markup, /\*a /);
  assert.doesNotMatch(markup, /<em>/);
  // Per-marker full-line rescans needed ~125 ms for this input; the bound is deliberately
  // loose so it only trips on a return to that quadratic behaviour, never on a slow machine.
  assert.ok(elapsed < 1000, `parsing 16 KB of markers took ${elapsed} ms`);
});

test("treats a fence-looking line as text instead of swallowing it whole", () => {
  const withLang = html("```js``` 这是代码");
  const plain = html("```代码见下方```");

  // A backtick fence's info string may not contain backticks, so these lines are ordinary text.
  assert.match(withLang, /这是代码/);
  assert.match(withLang, /js/);
  assert.doesNotMatch(withLang, /<pre>/);
  assert.match(plain, /代码见下方/);
  assert.doesNotMatch(plain, /<pre>/);
});

test("keeps emphasis working after a run of four or more asterisks", () => {
  const before = html("A**** B **bold** C");
  const inQuote = html("> 引用****\n> 也有 **加粗**");

  // The run used to fail the scan and cache that failure for the rest of the line.
  assert.match(before, /A\*\*\*\* B <strong>bold<\/strong> C/);
  assert.match(inQuote, /<strong>加粗<\/strong>/);
  assert.match(html("****"), /<p>\*\*\*\*<\/p>/);
});

test("caps quote nesting so a line of angle brackets cannot exhaust the stack", () => {
  const markup = html(">".repeat(2001) + " a");

  assert.ok(markup.includes("<blockquote>"));
  assert.ok((markup.match(/<blockquote>/g) ?? []).length <= 8, "quote nesting is capped");
});
