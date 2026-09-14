import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps create, learning, and management toolbars separate", async () => {
  const source = await readFile(new URL("../src/contentUi.tsx", import.meta.url), "utf8");
  const selection = source.match(/export function SelectionToolbar[\s\S]*?\n}\n/)?.[0];
  const learning = source.match(/export function LearningToolbar[\s\S]*?\n}\n/)?.[0];
  const management = source.match(/export function ExistingHighlightToolbar[\s\S]*?\n}\n/)?.[0];

  assert.ok(selection);
  assert.ok(learning);
  assert.ok(management);
  for (const icon of [
    "CopyIcon",
    "DownloadSimpleIcon",
    "ListBulletsIcon",
    "NotePencilIcon",
    "PaletteIcon",
    "SparkleIcon",
    "TagIcon",
    "TrashIcon",
    "XIcon",
  ]) {
    assert.match(source, new RegExp(icon));
  }
  assert.doesNotMatch(source, /BrainIcon/);
  assert.doesNotMatch(source, /<svg|const iconProps|const icons/);
  assert.match(selection, /onColor/);
  assert.match(selection, /onAi\?/);
  assert.match(learning, /onAi/);
  assert.doesNotMatch(learning, /onColor|onNote|onTags|onDelete/);
  assert.doesNotMatch(management, /onAi|aiUnderstanding/);
});

test("only renders the learning toolbar for signed-in selections", async () => {
  const source = await readFile(new URL("../src/contentController.tsx", import.meta.url), "utf8");

  assert.match(source, /visibleKind === "learn"/);
  assert.match(source, /getVisibleSelectionToolbarKind\(kind, signedIn\)/);
  assert.match(source, /LearningToolbar/);
  assert.match(source, /selection && !selection\.isCollapsed/);
});

test("closes a selection toolbar when the account state changes", async () => {
  const source = await readFile(new URL("../src/contentController.tsx", import.meta.url), "utf8");

  assert.match(source, /changes\[AI_AUTH_STATE_STORAGE_KEY\]/);
  assert.match(source, /this\.selectionRequestId \+= 1/);
  assert.match(source, /this\.mounts\.hideToolbar\(\)/);
});

test("reloads page highlights when the active local account database changes", async () => {
  const source = await readFile(new URL("../src/contentController.tsx", import.meta.url), "utf8");

  assert.match(source, /changes\[LOCAL_DATABASE_SCOPE_STORAGE_KEY\]/);
  assert.match(source, /this\.pagePromise = null/);
  assert.match(source, /this\.editorDirty = false/);
  assert.match(source, /changes\[LOCAL_DATABASE_SCOPE_STORAGE_KEY\][\s\S]*this\.refreshSyncedPage\(\)/);
});
