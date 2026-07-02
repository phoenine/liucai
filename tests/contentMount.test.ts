import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("updates an existing sidebar React root without unmounting it", async () => {
  const source = await readFile(
    new URL("../src/contentMount.tsx", import.meta.url),
    "utf8",
  );
  const method = source.match(
    /renderSidebar\(children: ReactNode\): void \{(?<body>[\s\S]*?)\n  \}/,
  )?.groups?.body;

  assert.ok(method);
  assert.match(method, /if \(this\.sidebar\)/);
  assert.match(method, /this\.sidebar\.root\.render\(children\)/);
  assert.doesNotMatch(method, /this\.hideSidebar\(\)/);
});
