import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { placeTooltip, TOOLTIP_COLORS } from "./highlightTooltip";
import type { HighlightColor } from "./types";

type MountedRoot = { root: Root; node: HTMLElement } | null;

export class ContentMounts {
  private toolbar: MountedRoot = null;
  private popover: MountedRoot = null;
  private sidebar: MountedRoot = null;
  private miniSidebar: MountedRoot = null;
  private highlightTooltip: HTMLElement | null = null;

  showToolbar(centerX: number, top: number, width: number, stateClass: string, children: ReactNode): void {
    this.hideToolbar();
    const node = document.createElement("div");
    node.className = `liucai-toolbar ${stateClass}`;
    node.style.left = `${Math.min(Math.max(8, centerX - width / 2), window.innerWidth - width - 8)}px`;
    node.style.top = `${Math.min(Math.max(8, top), window.innerHeight - 58)}px`;
    document.body.append(node);
    this.toolbar = this.renderInto(node, children);
  }

  showPopover(left: number, top: number, children: ReactNode): HTMLElement {
    this.hidePopover();
    const node = document.createElement("div");
    node.className = "liucai-popover liucai-editor-popover";
    node.style.left = `${Math.min(Math.max(8, left), Math.max(8, window.innerWidth - 336))}px`;
    node.style.top = `${Math.min(Math.max(8, top), Math.max(8, window.innerHeight - 328))}px`;
    node.style.visibility = "hidden";
    document.body.append(node);
    this.popover = this.renderInto(node, children);
    return node;
  }

  fitPopoverInViewport(node: HTMLElement): void {
    window.requestAnimationFrame(() => {
      const margin = 8;
      const rect = node.getBoundingClientRect();
      const nextLeft = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - rect.width - margin));
      const nextTop = Math.min(Math.max(margin, rect.top), Math.max(margin, window.innerHeight - rect.height - margin));
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
    this.hideSidebar();
    const node = document.createElement("div");
    node.className = "liucai-sidebar-root";
    document.body.append(node);
    this.sidebar = this.renderInto(node, children);
  }

  showHighlightTooltip(anchor: HTMLElement, text: string, color: HighlightColor): void {
    this.hideHighlightTooltip();
    const node = document.createElement("div");
    node.className = "liucai-highlight-tooltip";
    node.dataset.color = color;
    node.textContent = text;
    node.style.backgroundColor = TOOLTIP_COLORS[color];
    node.style.visibility = "hidden";
    document.body.append(node);
    this.highlightTooltip = node;

    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = node.getBoundingClientRect();
    const position = placeTooltip(
      anchorRect,
      tooltipRect,
      { width: window.innerWidth, height: window.innerHeight },
    );
    node.dataset.placement = position.placement;
    node.style.left = `${position.left}px`;
    node.style.top = `${position.top}px`;
    node.style.visibility = "visible";
  }

  hideToolbar(): void {
    this.toolbar = this.unmount(this.toolbar);
  }

  hidePopover(): void {
    this.popover = this.unmount(this.popover);
  }

  hideSidebar(): void {
    this.sidebar = this.unmount(this.sidebar);
  }

  hideMiniSidebar(): void {
    this.miniSidebar = this.unmount(this.miniSidebar);
  }

  hideHighlightTooltip(): void {
    this.highlightTooltip?.remove();
    this.highlightTooltip = null;
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
