import type {
  AiExample,
  AiExampleRequest,
  AiExplanation,
  AiExplainRequest,
  SyncStatus,
} from "./messages";

const REQUEST_TIMEOUT_MS = 30_000;

export interface AiExplanationDependencies {
  fetch: typeof fetch;
  getSyncStatus: () => Promise<SyncStatus>;
  getConnection: () => Promise<AiModelConnection | null>;
}

export interface AiModelConnection {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export async function explainSelection(
  request: AiExplainRequest,
  dependencies: AiExplanationDependencies,
): Promise<AiExplanation> {
  const status = await dependencies.getSyncStatus();
  if (!status.signedIn) throw new Error("AI_SIGN_IN_REQUIRED");

  const connection = await dependencies.getConnection();
  if (!connection) throw new Error("AI_MODEL_NOT_CONFIGURED");

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await sendResponseRequest(dependencies, connection, controller.signal, {
      instructions: buildInstructions(request.locale),
      input: buildInput(request.selectedText, request.contextText),
      reasoningEffort: "none",
      maxOutputTokens: 320,
    });
    return parseAiExplanation(await response.json(), request.locale);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("AI_REQUEST_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function generateExample(
  request: AiExampleRequest,
  dependencies: AiExplanationDependencies,
): Promise<AiExample> {
  const status = await dependencies.getSyncStatus();
  if (!status.signedIn) throw new Error("AI_SIGN_IN_REQUIRED");
  const connection = await dependencies.getConnection();
  if (!connection) throw new Error("AI_MODEL_NOT_CONFIGURED");

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const language = request.locale === "zh-CN" ? "简体中文" : "English";
    const response = await sendResponseRequest(dependencies, connection, controller.signal, {
      instructions: [
        `Give one concrete, memorable example in ${language}.`,
        "Use a concise code example when code makes the concept clearer, and preserve useful formatting.",
        "Keep internal reasoning brief and reserve enough output budget for the final answer.",
        'Return JSON only: {"example":"..."}. Do not wrap the JSON response in Markdown fences.',
      ].join("\n"),
      input: `${buildInput(request.selectedText, request.contextText)}\n\nConcept:\n${request.concept}`,
      reasoningEffort: "low",
      // Reasoning models count hidden reasoning, prose, and code against the same budget.
      maxOutputTokens: 4096,
    });
    return parseAiExample(await response.json(), request.locale);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("AI_REQUEST_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function testAiConnection(
  connection: AiModelConnection,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<void> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${connection.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(connection.apiKey ? { Authorization: `Bearer ${connection.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: connection.model,
        input: "Reply with exactly OK.",
        reasoning: { effort: "none" },
        max_output_tokens: 32,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`AI_REQUEST_FAILED:${response.status}`);
    if (!extractOutputText(await response.json()).trim()) throw new Error("AI_INVALID_RESPONSE");
  } catch (error) {
    if (controller.signal.aborted) throw new Error("AI_REQUEST_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export function parseAiExplanation(
  value: unknown,
  locale: AiExplainRequest["locale"] = "en",
): AiExplanation {
  const parsed = parseJsonOutput(value);

  return {
    concept: requireLimitedText(parsed.concept, locale, 20, 8),
    summary: requireLimitedText(parsed.summary, locale, 60, 30),
    contextualMeaning: requireLimitedText(parsed.contextualMeaning, locale, 120, 60),
  };
}

export function parseAiExample(
  value: unknown,
  _locale: AiExampleRequest["locale"] = "en",
): AiExample {
  const parsed = parseJsonOutput(value);
  return { example: requireFormattedText(parsed.example, 4000) };
}

function buildInstructions(locale: AiExplainRequest["locale"]): string {
  const language = locale === "zh-CN" ? "简体中文" : "English";
  const limits = locale === "zh-CN"
    ? "concept <= 20 Chinese characters, summary <= 60 Chinese characters, contextualMeaning <= 120 Chinese characters"
    : "concept <= 8 words, summary <= 30 words, contextualMeaning <= 60 words";
  return [
    `Explain the selected concept in ${language}.`,
    "Return JSON only, with exactly these string fields:",
    '{"concept":"...","summary":"...","contextualMeaning":"..."}',
    `Be accurate and concise (${limits}). Explain its meaning in the supplied context. Do not use Markdown fences.`,
  ].join("\n");
}

async function sendResponseRequest(
  dependencies: AiExplanationDependencies,
  connection: AiModelConnection,
  signal: AbortSignal,
  request: {
    instructions: string;
    input: string;
    reasoningEffort: "none" | "low";
    maxOutputTokens: number;
  },
): Promise<Response> {
  const response = await dependencies.fetch(`${connection.baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(connection.apiKey ? { Authorization: `Bearer ${connection.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: connection.model,
      instructions: request.instructions,
      input: request.input,
      reasoning: { effort: request.reasoningEffort },
      max_output_tokens: request.maxOutputTokens,
    }),
    signal,
  });
  if (!response.ok) throw new Error(`AI_REQUEST_FAILED:${response.status}`);
  return response;
}

function buildInput(selectedText: string, contextText: string): string {
  return `Selected text:\n${selectedText.trim()}\n\nNearby context:\n${contextText.trim() || selectedText.trim()}`;
}

function extractOutputText(value: unknown): string {
  if (!isRecord(value)) return "";
  if (typeof value.output_text === "string") return value.output_text;
  if (!Array.isArray(value.output)) return "";
  return value.output.flatMap((item) => {
    if (!isRecord(item) || !Array.isArray(item.content)) return [];
    return item.content.flatMap((content) => (
      isRecord(content) && typeof content.text === "string" ? [content.text] : []
    ));
  }).join("");
}

function parseJsonOutput(value: unknown): Record<string, unknown> {
  const outputText = extractOutputText(value);
  if (!outputText) throw new Error("AI_INVALID_RESPONSE");
  const unfenced = outputText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed: unknown = JSON.parse(unfenced);
    if (isRecord(parsed)) return parsed;
  } catch {
    // Fall through to the stable public error code.
  }
  throw new Error("AI_INVALID_RESPONSE");
}

function requireLimitedText(
  value: unknown,
  locale: AiExplainRequest["locale"],
  maxChineseCharacters: number,
  maxEnglishWords: number,
): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("AI_INVALID_RESPONSE");
  const text = value.trim();
  if (locale === "zh-CN") return text.slice(0, maxChineseCharacters);
  return text.split(/\s+/).slice(0, maxEnglishWords).join(" ");
}

function requireFormattedText(value: unknown, maxCharacters: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("AI_INVALID_RESPONSE");
  return value.trim().slice(0, maxCharacters);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
