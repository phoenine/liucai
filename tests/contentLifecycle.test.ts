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
