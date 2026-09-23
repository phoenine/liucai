import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = () => readFile(new URL("../src/highlights.tsx", import.meta.url), "utf8");
const readStyles = () => readFile(new URL("../src/highlights.css", import.meta.url), "utf8");

test("builds a dedicated all-highlights page and opens it from the popup", async () => {
  const [buildScript, html, popup] = await Promise.all([
    readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8"),
    readFile(new URL("../public/highlights.html", import.meta.url), "utf8"),
    readFile(new URL("../src/popup.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(buildScript, /src\/highlights\.tsx/);
  assert.match(buildScript, /highlights\.js/);
  assert.match(buildScript, /highlights\.css/);
  assert.match(html, /href="highlights\.css"/);
  assert.match(html, /src="highlights\.js"/);
  assert.match(popup, /chrome\.runtime\.getURL\("highlights\.html"\)/);
  assert.match(popup, /copy\.viewAllHighlights/);
});

test("loads the active local library without requiring sign-in", async () => {
  const source = await readSource();

  assert.match(source, /LIUCAI_STORAGE_GET_HIGHLIGHT_LIBRARY/);
  assert.match(source, /LIUCAI_SYNC_GET_STATUS/);
  assert.match(source, /LOCAL_DATABASE_SCOPE_STORAGE_KEY/);
  assert.match(source, /copy\.guestScope/);
  assert.doesNotMatch(source, /LIUCAI_SYNC_SIGN_IN|LIUCAI_SYNC_SIGN_UP/);
});

test("offers search, merged filter and sort menus, color chips, and tag selection", async () => {
  const [source, styles] = await Promise.all([readSource(), readStyles()]);

  assert.match(source, /type="search"/);
  assert.match(source, /\["all", "gold", "mint", "coral"\]/);
  assert.match(source, /copy\.filterWithNotes/);
  assert.match(source, /copy\.sorts\[sort\]/);
  assert.match(source, /copy\.allTags/);
  assert.match(source, /copy\.emptyTitle/);
  assert.match(source, /copy\.noResultsTitle/);
  assert.match(source, /copy\.loadFailed/);
  assert.match(source, /lc-browse-sentinel/);
  assert.match(source, /data-stuck=\{toolbarStuck\}/);
  assert.match(styles, /\.lc-browse\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/s);
  assert.match(styles, /\.lc-browse\[data-stuck="true"\]\s*\{[^}]*box-shadow:\s*0 1px 0/s);
  assert.match(styles, /\.lc-header\s*\{[^}]*margin-bottom:\s*18px;/s);
  assert.doesNotMatch(styles, /\.lc-header\s*\{[^}]*position:\s*sticky/s);
});

test("navigates by view and recent page from a compact sidebar", async () => {
  const [source, styles] = await Promise.all([readSource(), readStyles()]);

  assert.match(source, /\{ id: "all", icon: StackIcon \}/);
  assert.match(source, /\{ id: "pages", icon: BrowserIcon \}/);
  assert.match(source, /\{ id: "tags", icon: TagIcon \}/);
  assert.match(source, /\{ id: "colors", icon: PaletteIcon \}/);
  assert.match(source, /copy\.recentPages/);
  assert.match(source, /groups\.slice\(0, RECENT_PAGE_LIMIT\)/);
  assert.match(source, /copy\.collapseSidebar/);
  assert.match(source, /data-sidebar=\{sidebarCollapsed \? "collapsed" : "expanded"\}/);
  assert.match(styles, /--sidebar-expanded:\s*274px;/);
  assert.match(styles, /--sidebar-collapsed:\s*64px;/);
  assert.match(source, /SidebarSimpleIcon/);
  assert.match(styles, /\.lc-sidebar__toggle\s*\{[^}]*height:\s*38px;[^}]*width:\s*38px;/s);
  assert.match(styles, /data-sidebar="collapsed"\] \.lc-sidebar__toggle\s*\{[^}]*display:\s*none;/s);
  assert.doesNotMatch(styles, /\.lc-sidebar__toggle::before/);
  assert.match(styles, /\.lc-sidebar\s*\{[^}]*box-shadow:/s);
});

test("lays cards out in a regular auto-fill grid with clamped text", async () => {
  const styles = await readStyles();

  assert.match(styles, /\.lc-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill, minmax\(320px, 1fr\)\);/s);
  assert.match(styles, /\.lc-card__text\s*\{[^}]*-webkit-line-clamp:\s*6;/s);
  assert.match(styles, /\.lc-card__mark\s*\{[^}]*height:\s*4px;[^}]*width:\s*28px;/s);
  assert.match(styles, /\.lc-card__mark\s*\{[^}]*border-radius:\s*999px;/s);
  assert.match(styles, /\.lc-card__menu\s*\{[^}]*position:\s*absolute;[^}]*right:\s*10px;/s);
  assert.match(styles, /\.lc-card\s*\{[^}]*min-height:\s*170px;/s);
  assert.doesNotMatch(styles, /column-width|masonry/);
  assert.doesNotMatch(styles, /border-left:\s*4px/);
});

test("opens a details drawer with copy, source, and confirmed delete actions", async () => {
  const [source, styles] = await Promise.all([readSource(), readStyles()]);

  assert.match(source, /function DetailDrawer/);
  assert.match(source, /onOpen=\{\(\) => setSelectedId\(item\.highlight\.id\)\}/);
  assert.match(source, /LIUCAI_STORAGE_PUT_HIGHLIGHT/);
  assert.match(source, /deleteState === "confirm"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /copy\.aiReading[\s\S]*copy\.myNote[\s\S]*copy\.tags/);
  assert.match(source, /LIUCAI_AI_EXPLAIN/);
  assert.match(source, /copy\.previous/);
  assert.match(source, /copy\.next/);
  assert.doesNotMatch(source, /lc-drawer__source|lc-menu__info/);
  assert.match(styles, /\.lc-drawer__more-anchor\s*\{[^}]*margin-left:\s*auto;/s);
  assert.match(styles, /\.lc-drawer\s*\{[^}]*border-radius:\s*16px;[^}]*width:\s*min\(375px, calc\(100vw - 24px\)\);/s);
  assert.match(styles, /\.lc-drawer\s*\{[^}]*top:\s*var\(--lc-drawer-top, 12px\);/s);
  assert.match(source, /browse\.getBoundingClientRect\(\)\.bottom/);
  assert.match(source, /addEventListener\("scroll", syncDrawerTop/);
  assert.doesNotMatch(source, /if \(!toolbarStuck \|\| !browse\)/);
  assert.match(styles, /translateX\(24px\) scale\(0\.985\)/);
  assert.match(styles, /@media \(max-width: 1199px\)\s*\{[^}]*\.lc-drawer-scrim/s);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("renders notes with the same safe Markdown component as the page sidebar", async () => {
  const [source, styles] = await Promise.all([readSource(), readStyles()]);

  assert.match(source, /import \{ SafeMarkdown \} from "\.\/content\/safeMarkdown"/);
  assert.match(source, /<SafeMarkdown>\{note\}<\/SafeMarkdown>/);
  assert.match(styles, /\.liucai-markdown pre code/);
});
