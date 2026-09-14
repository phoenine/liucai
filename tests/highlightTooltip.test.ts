import test from "node:test";
import assert from "node:assert/strict";
import { clientRectNearPoint, placeTooltip, TOOLTIP_COLORS, HIGHLIGHT_SOFT } from "../src/content/highlightTooltip.ts";

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

test("anchors a tooltip to the line box nearest the pointer", () => {
  const nearest = clientRectNearPoint(
    [
      { left: 10, right: 100, top: 10, bottom: 24, width: 90, height: 14 },
      { left: 10, right: 220, top: 28, bottom: 42, width: 210, height: 14 },
      { left: 10, right: 180, top: 46, bottom: 60, width: 170, height: 14 },
    ],
    40,
    50,
  );

  assert.deepEqual(nearest, { left: 10, right: 180, top: 46, bottom: 60, width: 170, height: 14 });
});

test("provides a light background for every highlight color", () => {
  assert.deepEqual(TOOLTIP_COLORS, HIGHLIGHT_SOFT);
});

test("keeps the below-anchor fallback in the viewport when the anchor sits above it", () => {
  // A line box under a cursor at the very top edge can have a negative bottom.
  const placement = placeTooltip(
    { left: 0, right: 100, top: -80, bottom: -60 },
    { width: 160, height: 60 },
    { width: 400, height: 300 },
  );

  assert.equal(placement.placement, "bottom");
  assert.equal(placement.top, 8);
});
