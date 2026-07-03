import type { HighlightColor, HighlightRecord } from "./types";

const COLOR_MARKERS: Record<HighlightColor, string> = {
  gold: "🟡",
  mint: "🟢",
  coral: "🟠",
};

const MAX_TITLE_LENGTH = 40;

export function formatObsidianHighlight(
  record: HighlightRecord,
  pageTitle: string,
): string {
  const title = escapeLinkLabel(
    truncateTitle(pageTitle.trim() || hostnameFromUrl(record.canonicalUrl)),
  );
  const url = escapeLinkDestination(record.canonicalUrl);
  const sourceLines = normalizeNewlines(record.text)
    .trim()
    .split("\n")
    .map((line) => line ? `*${escapeMarkdownText(line)}*` : "");
  const note = normalizeNewlines(record.note).trim();
  const tags = (Array.isArray(record.tags) ? record.tags : [])
    .map(normalizeTag)
    .filter(Boolean);
  const lines = [
    `[!quote] ${COLOR_MARKERS[record.color]} 网页摘录 · [${title}](${url})`,
    "",
    ...sourceLines,
  ];

  if (note || tags.length > 0) {
    lines.push("", "---");
  }
  if (note) {
    lines.push("", "**批注**", "", ...note.split("\n"));
  }
  if (tags.length > 0) {
    lines.push("", `**标签：** ${tags.map((tag) => `#${tag}`).join(" ")}`);
  }

  return lines
    .map((line) => line ? `> ${line}` : ">")
    .join("\n");
}

function truncateTitle(value: string): string {
  const characters = Array.from(value);
  if (characters.length <= MAX_TITLE_LENGTH) {
    return value;
  }
  return `${characters.slice(0, MAX_TITLE_LENGTH - 1).join("")}…`;
}

function hostnameFromUrl(value: string): string {
  try {
    return new URL(value).hostname || value;
  } catch {
    return value;
  }
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/, "").replace(/\s+/gu, "-");
}

function escapeMarkdownText(value: string): string {
  return value.replace(/[\\`*_[\]]/g, "\\$&");
}

function escapeLinkLabel(value: string): string {
  return value.replace(/[\\[\]]/g, "\\$&");
}

function escapeLinkDestination(value: string): string {
  return value.replace(/[\\()]/g, "\\$&");
}
