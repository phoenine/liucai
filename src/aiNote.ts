import type { ResolvedLocale } from "./localization";
import type { AiExplanation } from "./messages";

export function formatAiExplanationNote(
  explanation: AiExplanation,
  locale: ResolvedLocale,
  example?: string,
): string {
  if (locale === "zh-CN") {
    return [
      `AI 解释｜${explanation.concept}`,
      explanation.explanation,
      ...(example ? [`例子：${example}`] : []),
    ].join("\n");
  }
  return [
    `AI explanation | ${explanation.concept}`,
    explanation.explanation,
    ...(example ? [`Example: ${example}`] : []),
  ].join("\n");
}

/**
 * Notes are otherwise unbounded: every append lands in IndexedDB, in the sync payload and in the
 * Obsidian export, and a single append can already add a few thousand characters.
 */
export const MAX_NOTE_LENGTH = 200_000;

export function appendNote(existing: string, addition: string): string {
  const current = existing.trim();
  const next = current ? `${current}\n\n${addition.trim()}` : addition.trim();
  return next.length > MAX_NOTE_LENGTH ? next.slice(0, MAX_NOTE_LENGTH) : next;
}
