export interface NoteEdit {
  value: string;
  caret: number;
}

export function continueNoteList(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): NoteEdit | null {
  if (selectionStart !== selectionEnd) {
    return null;
  }

  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const nextBreak = value.indexOf("\n", selectionStart);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  if (selectionStart !== lineEnd) {
    return null;
  }

  const line = value.slice(lineStart, lineEnd);
  const ordered = line.match(/^(\d+)\.\s(.*)$/);
  const unordered = line.match(/^-\s(.*)$/);
  if (!ordered && !unordered) {
    return null;
  }

  const item = ordered?.[2] ?? unordered?.[1] ?? "";
  if (!item.trim()) {
    return {
      value: value.slice(0, lineStart) + value.slice(lineEnd),
      caret: lineStart,
    };
  }

  const marker = ordered
    ? `${Number.parseInt(ordered[1], 10) + 1}. `
    : "- ";
  const insertion = `\n${marker}`;
  return {
    value: value.slice(0, selectionStart) + insertion + value.slice(selectionEnd),
    caret: selectionStart + insertion.length,
  };
}
