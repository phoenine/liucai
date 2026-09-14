import type { HighlightColor } from "../shared/types";

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 8;

export const HIGHLIGHT_SOFT: Record<HighlightColor, string> = {
  gold: "#fff7dc",
  mint: "#e8fbf5",
  coral: "#fff0ec",
};

export const HIGHLIGHT_ACCENT: Record<HighlightColor, string> = {
  gold: "#ffea70",
  mint: "#4df4c9",
  coral: "#ffafa1",
};

export const HIGHLIGHT_MARKER: Record<HighlightColor, string> = {
  gold: "#a85d35",
  mint: "#13795b",
  coral: "#b94a3b",
};

export const TOOLTIP_COLORS = HIGHLIGHT_SOFT;

interface AnchorRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface TooltipSize {
  width: number;
  height: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

export interface TooltipPlacement {
  left: number;
  top: number;
  placement: "top" | "bottom";
}

export function clientRectNearPoint(
  rects: ArrayLike<{ left: number; right: number; top: number; bottom: number; width: number; height: number }>,
  x: number,
  y: number,
): { left: number; right: number; top: number; bottom: number } | null {
  let best: { left: number; right: number; top: number; bottom: number } | null = null;
  let bestDistance = Infinity;

  for (let index = 0; index < rects.length; index += 1) {
    const rect = rects[index];
    if (rect.width === 0 && rect.height === 0) {
      continue;
    }
    const clampedX = Math.max(rect.left, Math.min(x, rect.right));
    const clampedY = Math.max(rect.top, Math.min(y, rect.bottom));
    const distance = (x - clampedX) ** 2 + (y - clampedY) ** 2;
    if (distance < bestDistance) {
      best = rect;
      bestDistance = distance;
    }
  }

  return best;
}

export function placeTooltip(
  anchor: AnchorRect,
  tooltip: TooltipSize,
  viewport: ViewportSize,
): TooltipPlacement {
  const centeredLeft = (anchor.left + anchor.right - tooltip.width) / 2;
  const maximumLeft = Math.max(
    VIEWPORT_MARGIN,
    viewport.width - VIEWPORT_MARGIN - tooltip.width,
  );
  const left = Math.min(Math.max(VIEWPORT_MARGIN, centeredLeft), maximumLeft);
  const topPosition = anchor.top - ANCHOR_GAP - tooltip.height;

  if (topPosition >= VIEWPORT_MARGIN) {
    return { left, top: topPosition, placement: "top" };
  }

  const maximumTop = Math.max(
    VIEWPORT_MARGIN,
    viewport.height - VIEWPORT_MARGIN - tooltip.height,
  );
  return {
    left,
    // Clamped at both ends. Falling back to "below the anchor" is wrong when the anchor itself
    // sits above the viewport (the line box nearest a cursor at the very top edge), and the old
    // upper-bound-only clamp happily returned a negative top for exactly that case.
    top: Math.min(Math.max(VIEWPORT_MARGIN, anchor.bottom + ANCHOR_GAP), maximumTop),
    placement: "bottom",
  };
}
