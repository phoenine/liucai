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

export function appendNote(existing: string, addition: string): string {
  const current = existing.trim();
  return current ? `${current}\n\n${addition.trim()}` : addition.trim();
}
