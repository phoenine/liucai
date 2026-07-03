import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("sidebar presents list title and count before the secondary page title", async () => {
  const source = await readFile(new URL("../src/contentUi.tsx", import.meta.url), "utf8");
  const sidebar = source.slice(
    source.indexOf("export function HighlightSidebar"),
    source.indexOf("function HighlightSidebarItem"),
  );

  const headingIndex = sidebar.indexOf("liucai-sidebar__heading");
  const countIndex = sidebar.indexOf("liucai-sidebar__count");
  const pageTitleIndex = sidebar.indexOf("liucai-sidebar__page-title");
  const dividerIndex = sidebar.indexOf("liucai-sidebar__divider");
  const listIndex = sidebar.indexOf("liucai-sidebar__list");

  assert.ok(headingIndex >= 0);
  assert.ok(countIndex > headingIndex);
  assert.ok(pageTitleIndex > countIndex);
  assert.ok(dividerIndex > pageTitleIndex);
  assert.ok(listIndex > dividerIndex);
  assert.doesNotMatch(sidebar, /当前页面/);
});

test("sidebar card keeps tags above actions without an extra footer wrapper", async () => {
  const source = await readFile(new URL("../src/contentUi.tsx", import.meta.url), "utf8");
  const item = source.slice(
    source.indexOf("function HighlightSidebarItem"),
    source.indexOf("export function HighlightTooltip"),
  );

  const tagsIndex = item.indexOf("liucai-sidebar-item__tags");
  const actionsIndex = item.indexOf("liucai-sidebar-item__actions");

  assert.doesNotMatch(item, /liucai-sidebar-item__footer/);
  assert.ok(tagsIndex >= 0);
  assert.ok(actionsIndex > tagsIndex);
});
