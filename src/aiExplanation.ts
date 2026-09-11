import type {
  AiExample,
  AiExampleRequest,
  AiExplanation,
  AiExplainRequest,
  SyncStatus,
} from "./messages";

const REQUEST_TIMEOUT_MS = 30_000;

export const AI_CONCEPT_LIMIT = { "zh-CN": 20, en: 8 } as const;
export const AI_EXPLANATION_LIMIT = { "zh-CN": 100, en: 50 } as const;

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

/**
 * `signal` lets the caller drop a request it no longer cares about: closing the AI card should not
 * leave a local model generating for the rest of the timeout.
 */
export async function explainSelection(
  request: AiExplainRequest,
  dependencies: AiExplanationDependencies,
  signal?: AbortSignal,
): Promise<AiExplanation> {
  const status = await dependencies.getSyncStatus();
  if (!status.signedIn) throw new Error("AI_SIGN_IN_REQUIRED");

  const connection = await dependencies.getConnection();
  if (!connection) throw new Error("AI_MODEL_NOT_CONFIGURED");

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortFromCaller = (): void => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    const response = await sendResponseRequest(dependencies, connection, controller.signal, {
      instructions: buildInstructions(request.locale),
      input: buildInput(request.selectedText, request.contextText),
      reasoningEffort: "none",
      maxOutputTokens: 320,
    });
    return parseAiExplanation(await response.json(), request.locale);
  } catch (error) {
    if (signal?.aborted) throw new Error("AI_REQUEST_CANCELLED");
    if (controller.signal.aborted) throw new Error("AI_REQUEST_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function generateExample(
  request: AiExampleRequest,
  dependencies: AiExplanationDependencies,
  signal?: AbortSignal,
): Promise<AiExample> {
  const status = await dependencies.getSyncStatus();
  if (!status.signedIn) throw new Error("AI_SIGN_IN_REQUIRED");
  const connection = await dependencies.getConnection();
  if (!connection) throw new Error("AI_MODEL_NOT_CONFIGURED");

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortFromCaller = (): void => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
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
    if (signal?.aborted) throw new Error("AI_REQUEST_CANCELLED");
    if (controller.signal.aborted) throw new Error("AI_REQUEST_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
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
    concept: requireLimitedText(parsed.concept, locale, AI_CONCEPT_LIMIT["zh-CN"], AI_CONCEPT_LIMIT.en),
    explanation: requireLimitedText(
      parsed.explanation,
      locale,
      AI_EXPLANATION_LIMIT["zh-CN"],
      AI_EXPLANATION_LIMIT.en,
    ),
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
    ? `concept <= ${AI_CONCEPT_LIMIT["zh-CN"]} Chinese characters, explanation <= ${AI_EXPLANATION_LIMIT["zh-CN"]} Chinese characters`
    : `concept <= ${AI_CONCEPT_LIMIT.en} words, explanation <= ${AI_EXPLANATION_LIMIT.en} words`;
  return [
    `Explain the selected concept in ${language}.`,
    "Return JSON only, with exactly these string fields:",
    '{"concept":"...","explanation":"..."}',
    `Be accurate and concise (${limits}). In one coherent explanation of no more than two sentences, clarify what the concept is and then explain what it means in the supplied context. Avoid repeating the same idea. Light Markdown emphasis is allowed when useful, but do not use Markdown fences.`,
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
  // An empty output_text is not the same as a missing one: OpenAI-compatible gateways commonly
  // send `output_text: ""` alongside a complete `output` array, and returning early there threw
  // away a perfectly good response (AI explanations, examples and "test connection" all failed).
  const direct = typeof value.output_text === "string" ? value.output_text : "";
  if (direct.trim()) return direct;
  if (!Array.isArray(value.output)) return direct;
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
  const parsed = parseFirstObject(unfenced) ?? parseFirstObject(outputText);
  if (parsed) return parsed;
  throw new Error("AI_INVALID_RESPONSE");
}

/**
 * The first balanced {...} in the text, or null.
 *
 * Local models routinely wrap the JSON in a sentence ("Here is the JSON: {...}") no matter how the
 * instructions are phrased, and treating that as an invalid response made working models look
 * broken. Braces inside strings are skipped so the object is found correctly.
 */
function parseFirstObject(text: string): Record<string, unknown> | null {
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    const candidate = balancedObjectAt(text, start);
    if (!candidate) continue;
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (isRecord(parsed)) return parsed;
    } catch {
      // Keep scanning: prose may contain braces before the actual JSON object.
    }
  }
  return null;
}

function balancedObjectAt(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
    } else if (char === "\\" && inString) {
      escaped = true;
    } else if (char === '"') {
      inString = !inString;
    } else if (!inString && char === "{") {
      depth += 1;
    } else if (!inString && char === "}" && --depth === 0) {
      return text.slice(start, index + 1);
    }
  }
  return null;
}

function requireLimitedText(
  value: unknown,
  locale: AiExplainRequest["locale"],
  maxChineseCharacters: number,
  maxEnglishWords: number,
): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("AI_INVALID_RESPONSE");
  const text = value.trim();
  if (locale === "zh-CN") return Array.from(text).slice(0, maxChineseCharacters).join("");
  return text.split(/\s+/).slice(0, maxEnglishWords).join(" ");
}

function requireFormattedText(value: unknown, maxCharacters: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("AI_INVALID_RESPONSE");
  return value.trim().slice(0, maxCharacters);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
