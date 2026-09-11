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

/** Keep this aligned with the server-side note limit; JavaScript length is conservatively UTF-16. */
export const MAX_NOTE_LENGTH = 1_048_576;

export function appendNote(existing: string, addition: string): string {
  const current = existing.trim();
  const next = current ? `${current}\n\n${addition.trim()}` : addition.trim();
  if (next.length > MAX_NOTE_LENGTH) throw new Error("NOTE_TOO_LONG");
  return next;
}
