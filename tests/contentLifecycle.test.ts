import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function controllerSource(): Promise<string> {
  return readFile(new URL("../src/contentController.tsx", import.meta.url), "utf8");
}

test("re-activates a page whose URL turned into a same-canonical variant mid-switch", async () => {
  const source = await controllerSource();

  // switchPage() deactivates before it settles, so landing on the same-canonical branch afterwards
  // leaves the page torn down. Without this branch nothing brings it back.
  assert.match(
    source,
    /if \(!this\.pageActive\) \{\s*void this\.transitions\s*\.run\(\(\) => this\.syncActivation\(\)\)/s,
  );
});

test("sidebar refresh bails out once the page is no longer live", async () => {
  const source = await controllerSource();

  // A late IPC reply must not remount the sidebar on a deactivated (or newly disabled) page.
  assert.match(source, /if \(this\.disposed \|\| \(!force && !this\.pageActive\)\) \{\s*return;/s);
  // The activation path has to opt out of that guard, because it renders before flipping pageActive.
  assert.match(source, /refreshSidebarData\(true\)/);
  assert.match(source, /if \(this\.disposed \|\| !this\.pageActive\) \{\s*return;/s);
});

test("keeps the note editor open while it holds unsaved edits", async () => {
  const controller = await controllerSource();
  const ui = await readFile(new URL("../src/contentUi.tsx", import.meta.url), "utf8");

  // A plain page click used to unmount the editor and discard whatever was typed.
  assert.match(controller, /if \(!this\.editorDirty\) \{\s*this\.mounts\.hidePopover\(\);/s);
  assert.match(controller, /onDirtyChange=\{\(dirty\) => \{\s*this\.editorDirty = dirty;/s);
  assert.match(ui, /props\.onDirtyChange\?\.\(dirty\)/);
});

test("reports a failed note save instead of failing silently", async () => {
  const ui = await readFile(new URL("../src/contentUi.tsx", import.meta.url), "utf8");
  const controller = await controllerSource();

  assert.match(ui, /setSaveStatus\("failed"\)/);
  assert.match(ui, /props\.copy\.saveFailed/);
  // A missing record has to reject, or the sidebar's delete button stays disabled on "deleting".
  assert.match(controller, /HIGHLIGHT_NOT_FOUND/);
});

test("freezes the page identity before awaiting in createHighlight", async () => {
  const source = await controllerSource();

  assert.match(
    source,
    /const canonicalUrl = this\.identity\.canonicalUrl;\s*const page = await this\.getCurrentPage\(\);/s,
  );
  assert.match(source, /this\.identity\.canonicalUrl !== canonicalUrl/);
});

test("activates the page before the storage round trips", async () => {
  const source = await controllerSource();
  const listeners = source.indexOf('document.addEventListener("mousedown"');
  const restore = source.indexOf("await this.restoreHighlights();");

  // One failed IPC round trip used to leave the tab with no listeners at all and no way back.
  assert.ok(listeners !== -1, "mousedown listener is registered");
  assert.ok(restore !== -1, "restore call is present");
  assert.ok(listeners < restore, "listeners register before the restore call");
});

test("drops the tooltip when the viewport moves and aborts model work on close", async () => {
  const source = await controllerSource();

  // A fixed-position tooltip does not follow its anchor on scroll or resize, and no pointerout comes.
  assert.match(source, /document\.addEventListener\("scroll", this\.handleViewportChange, true\)/);
  assert.match(source, /document\.removeEventListener\("scroll", this\.handleViewportChange, true\)/);
  assert.match(source, /window\.addEventListener\("resize", this\.handleViewportChange\)/);
  // Closing the AI card has to abort the background request, not just ignore its answer.
  assert.match(source, /type: "LIUCAI_AI_CANCEL"/);
});
