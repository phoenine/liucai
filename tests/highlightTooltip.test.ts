import test from "node:test";
import assert from "node:assert/strict";
import { placeTooltip, TOOLTIP_COLORS } from "../src/highlightTooltip.ts";

test("places a tooltip above the highlight when space is available", () => {
  assert.deepEqual(
    placeTooltip(
      { left: 100, right: 140, top: 100, bottom: 120 },
      { width: 160, height: 60 },
      { width: 400, height: 300 },
    ),
    { left: 40, top: 32, placement: "top" },
  );
});

test("places a tooltip below the highlight when top space is insufficient", () => {
  assert.deepEqual(
    placeTooltip(
      { left: 100, right: 140, top: 20, bottom: 40 },
      { width: 160, height: 60 },
      { width: 400, height: 300 },
    ),
    { left: 40, top: 48, placement: "bottom" },
  );
});

test("keeps a tooltip inside the horizontal viewport margin", () => {
  assert.equal(
    placeTooltip(
      { left: 4, right: 24, top: 100, bottom: 120 },
      { width: 160, height: 60 },
      { width: 400, height: 300 },
    ).left,
    8,
  );
});

test("provides a light background for every highlight color", () => {
  assert.deepEqual(TOOLTIP_COLORS, {
    gold: "#fffbe6",
    mint: "#ecfff9",
    coral: "#fff1ee",
  });
});
