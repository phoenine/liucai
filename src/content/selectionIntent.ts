export type SelectionToolbarKind = "create" | "learn";

export function getVisibleSelectionToolbarKind(
  kind: SelectionToolbarKind,
  signedIn: boolean,
): SelectionToolbarKind | null {
  return kind === "learn" && !signedIn ? null : kind;
}

export function getSelectionToolbarKind(
  range: Pick<Range, "intersectsNode">,
  highlights: Iterable<Node>,
): SelectionToolbarKind {
  for (const highlight of highlights) {
    try {
      if (range.intersectsNode(highlight)) return "learn";
    } catch {
      // Ignore a highlight that was detached while the selection was being resolved.
    }
  }
  return "create";
}
