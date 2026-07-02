import type { HighlightColor } from "./types";

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 8;

export const TOOLTIP_COLORS: Record<HighlightColor, string> = {
  gold: "#fffbe6",
  mint: "#ecfff9",
  coral: "#fff1ee",
};

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
    top: Math.min(anchor.bottom + ANCHOR_GAP, maximumTop),
    placement: "bottom",
  };
}
