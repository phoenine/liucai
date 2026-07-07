import type { HighlightColor, HighlightRecord } from "./types";

const COLOR_MARKERS: Record<HighlightColor, string> = {
  gold: "🟡",
  mint: "🟢",
  coral: "🟠",
};

const MAX_TITLE_LENGTH = 40;
const MAX_FILENAME_TITLE_LENGTH = 80;

export function createObsidianExportFilename(pageTitle: string): string {
  const title = sanitizeFilenamePart(pageTitle) || "未命名页面";
  return `【摘录】${title}.md`;
}

export function formatObsidianPageExport(input: {
  pageTitle: string;
  canonicalUrl: string;
  highlights: HighlightRecord[];
  exportedAt?: Date;
}): string {
  const title = input.pageTitle.trim() || hostnameFromUrl(input.canonicalUrl);
  const exportedAt = formatLocalDateTime(input.exportedAt ?? new Date());
  const frontmatterTags = collectFrontmatterTags(input.highlights);
  const blocks = input.highlights.map((record) => (
    formatObsidianHighlight(record, title)
  ));

  return [
    "---",
    `创建时间: ${exportedAt}`,
    `划线数量: ${input.highlights.length}`,
    "tags:",
    ...frontmatterTags.map((tag) => `  - ${formatYamlScalar(tag)}`),
    `原文链接: ${input.canonicalUrl}`,
    "---",
    `# ${escapeMarkdownHeading(title)}`,
    "",
    `> [阅读原文](${escapeLinkDestination(input.canonicalUrl)})`,
    "",
    "---",
    "",
    ...blocks.flatMap((block) => [block, "", "---", ""]),
  ].slice(0, -1).join("\n");
}

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

function formatLocalDateTime(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/, "").replace(/\s+/gu, "-");
}

function collectFrontmatterTags(highlights: HighlightRecord[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const record of highlights) {
    for (const value of Array.isArray(record.tags) ? record.tags : []) {
      const tag = normalizeTag(value);
      if (!tag || seen.has(tag)) {
        continue;
      }
      seen.add(tag);
      tags.push(tag);
    }
  }

  return tags;
}

function formatYamlScalar(value: string): string {
  const normalized = value.replace(/\r?\n/g, " ").trim();
  if (!needsQuotedYamlScalar(normalized)) {
    return normalized;
  }

  return `"${normalized
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")}"`;
}

function needsQuotedYamlScalar(value: string): boolean {
  return (
    value === ""
    || /:\s/.test(value)
    || /^\s|\s$/.test(value)
    || /^[#,[\]{}&*!?|>'"%@`-]/.test(value)
    || /[\[\]{}]/.test(value)
  );
}

function escapeMarkdownHeading(value: string): string {
  return value.replace(/^#+\s*/g, "").replace(/\r?\n/g, " ").trim();
}

function sanitizeFilenamePart(value: string): string {
  return Array.from(
    value
      .trim()
      .replace(/[\\/]+/g, "-")
      .replace(/[:*?"<>|]+/g, "")
      .replace(/\s+/g, " ")
      .replace(/-+/g, "-")
      .replace(/^[.\-\s]+|[.\-\s]+$/g, ""),
  ).slice(0, MAX_FILENAME_TITLE_LENGTH).join("");
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
