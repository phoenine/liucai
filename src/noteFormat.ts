export type NoteBlock =
  | { type: "paragraph"; lines: string[] }
  | { type: "ordered-list"; start: number; items: string[] }
  | { type: "unordered-list"; items: string[] };

export interface NoteEdit {
  value: string;
  caret: number;
}

export function parseNoteBlocks(value: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let current: NoteBlock | null = null;

  const flush = (): void => {
    if (current) {
      blocks.push(current);
      current = null;
    }
  };

  for (const line of value.split(/\r?\n/)) {
    if (!line.trim()) {
      flush();
      continue;
    }

    const ordered = line.match(/^(\d+)\.\s+(.+)$/);
    if (ordered) {
      const item = ordered[2];
      if (current?.type === "ordered-list") {
        current.items.push(item);
      } else {
        flush();
        current = {
          type: "ordered-list",
          start: Number.parseInt(ordered[1], 10),
          items: [item],
        };
      }
      continue;
    }

    const unordered = line.match(/^-\s+(.+)$/);
    if (unordered) {
      const item = unordered[1];
      if (current?.type === "unordered-list") {
        current.items.push(item);
      } else {
        flush();
        current = { type: "unordered-list", items: [item] };
      }
      continue;
    }

    if (current?.type === "paragraph") {
      current.lines.push(line);
    } else {
      flush();
      current = { type: "paragraph", lines: [line] };
    }
  }

  flush();
  return blocks;
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
