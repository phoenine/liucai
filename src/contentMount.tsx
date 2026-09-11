import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clientRectNearPoint, placeTooltip } from "./highlightTooltip";
import type { HighlightColor } from "./types";

type MountedRoot = { root: Root; node: HTMLElement } | null;

/**
 * Viewport size excluding classic scrollbars.
 *
 * `window.innerWidth` counts the scrollbar, so anything clamped against it can still land underneath
 * one. `documentElement.clientWidth` is the space actually available to us.
 */
function viewportWidth(): number {
  return document.documentElement.clientWidth;
}

function viewportHeight(): number {
  return document.documentElement.clientHeight;
}

export class ContentMounts {
  private toolbar: MountedRoot = null;
  private popover: MountedRoot = null;
  private sidebar: MountedRoot = null;
  private miniSidebar: MountedRoot = null;
  private highlightTooltip: MountedRoot = null;

  showToolbar(centerX: number, top: number, width: number, stateClass: string, children: ReactNode): void {
    this.hideToolbar();
    const node = document.createElement("div");
    node.className = `liucai-toolbar ${stateClass}`;
    node.style.left = `${Math.min(Math.max(8, centerX - width / 2), viewportWidth() - width - 8)}px`;
    node.style.top = `${Math.min(Math.max(8, top), viewportHeight() - 58)}px`;
    document.body.append(node);
    this.toolbar = this.renderInto(node, children);
  }

  showPopover(
    left: number,
    top: number,
    children: ReactNode,
    stateClass = "liucai-editor-popover",
  ): HTMLElement {
    this.hidePopover();
    const node = document.createElement("div");
    node.className = `liucai-popover ${stateClass}`;
    node.style.left = `${Math.min(Math.max(8, left), Math.max(8, viewportWidth() - 336))}px`;
    node.style.top = `${Math.min(Math.max(8, top), Math.max(8, viewportHeight() - 328))}px`;
    node.style.visibility = "hidden";
    document.body.append(node);
    this.popover = this.renderInto(node, children);
    return node;
  }

  fitPopoverInViewport(node: HTMLElement): void {
    window.requestAnimationFrame(() => {
      const margin = 8;
      const rect = node.getBoundingClientRect();
      const nextLeft = Math.min(Math.max(margin, rect.left), Math.max(margin, viewportWidth() - rect.width - margin));
      const nextTop = Math.min(Math.max(margin, rect.top), Math.max(margin, viewportHeight() - rect.height - margin));
      node.style.left = `${nextLeft}px`;
      node.style.top = `${nextTop}px`;
      node.style.visibility = "visible";
    });
  }

  renderMiniSidebar(children: ReactNode): void {
    if (this.miniSidebar) {
      this.miniSidebar.root.render(children);
      return;
    }
    const node = document.createElement("div");
    node.className = "liucai-mini-sidebar-root";
    document.body.append(node);
    this.miniSidebar = this.renderInto(node, children);
  }

  renderSidebar(children: ReactNode): void {
    if (this.sidebar) {
      this.sidebar.root.render(children);
      return;
    }
    const node = document.createElement("div");
    node.className = "liucai-sidebar-root";
    document.body.append(node);
    this.sidebar = this.renderInto(node, children);
  }

  showHighlightTooltip(
    anchor: HTMLElement,
    color: HighlightColor,
    children: ReactNode,
    pointer?: { x: number; y: number },
  ): void {
    this.hideHighlightTooltip();
    const node = document.createElement("div");
    node.className = "liucai-highlight-tooltip";
    node.dataset.color = color;
    node.style.visibility = "hidden";
    document.body.append(node);
    const mounted = this.renderInto(node, children);
    this.highlightTooltip = mounted;

    window.requestAnimationFrame(() => {
      if (this.highlightTooltip !== mounted || !node.isConnected || !anchor.isConnected) {
        return;
      }
      const anchorRect = pointer
        ? clientRectNearPoint(anchor.getClientRects(), pointer.x, pointer.y) ?? anchor.getBoundingClientRect()
        : anchor.getBoundingClientRect();
      const position = placeTooltip(
        anchorRect,
        node.getBoundingClientRect(),
        { width: viewportWidth(), height: viewportHeight() },
      );
      node.dataset.placement = position.placement;
      node.style.left = `${position.left}px`;
      node.style.top = `${position.top}px`;
      node.style.visibility = "visible";
    });
  }

  hideToolbar(): void {
    this.toolbar = this.unmount(this.toolbar);
  }

  hidePopover(): void {
    this.popover = this.unmount(this.popover);
  }

  hasPopover(): boolean {
    return this.popover !== null;
  }

  hideSidebar(): void {
    this.sidebar = this.unmount(this.sidebar);
  }

  hideMiniSidebar(): void {
    this.miniSidebar = this.unmount(this.miniSidebar);
  }

  hideHighlightTooltip(): void {
    this.highlightTooltip = this.unmount(this.highlightTooltip);
  }

  hideAll(): void {
    this.hideToolbar();
    this.hidePopover();
    this.hideSidebar();
    this.hideMiniSidebar();
    this.hideHighlightTooltip();
  }

  private renderInto(node: HTMLElement, children: ReactNode): Exclude<MountedRoot, null> {
    const root = createRoot(node);
    root.render(children);
    return { root, node };
  }

  private unmount(mounted: MountedRoot): null {
    mounted?.root.unmount();
    mounted?.node.remove();
    return null;
  }
}
