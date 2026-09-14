export type ResponseTextUpdate = (text: string) => void;

export async function readResponseOutput(
  response: Response,
  onUpdate?: ResponseTextUpdate,
): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!onUpdate || !contentType.toLowerCase().includes("text/event-stream") || !response.body) {
    const payload: unknown = await response.json();
    requireCompleteResponse(payload);
    const text = extractResponseOutputText(payload);
    if (onUpdate && text) onUpdate(text);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  let completedOutput = "";

  const consumeFrame = (frame: string): void => {
    let eventName = "";
    const data: string[] = [];
    for (const line of frame.replace(/\r\n/g, "\n").split("\n")) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    const serialized = data.join("\n");
    if (!serialized || serialized === "[DONE]") return;

    let payload: unknown;
    try {
      payload = JSON.parse(serialized);
    } catch {
      return;
    }
    if (!isRecord(payload)) return;

    const eventType = typeof payload.type === "string" ? payload.type : eventName;
    if (eventType === "response.output_text.delta" && typeof payload.delta === "string") {
      output += payload.delta;
      if (output) onUpdate(output);
      return;
    }
    if (eventType === "response.output_text.done" && !output && typeof payload.text === "string") {
      completedOutput = payload.text;
      return;
    }
    if (eventType === "response.completed" && isRecord(payload.response)) {
      requireCompleteResponse(payload.response);
      completedOutput = extractResponseOutputText(payload.response);
      return;
    }
    if (eventType === "response.incomplete") {
      throw new Error("AI_RESPONSE_INCOMPLETE");
    }
    if (eventType === "error" || eventType === "response.failed") {
      throw new Error("AI_REQUEST_FAILED");
    }
  };

  const consumeFrames = (): void => {
    while (true) {
      const boundary = buffer.match(/\r?\n\r?\n/);
      if (!boundary || boundary.index === undefined) return;
      const frame = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
      consumeFrame(frame);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    consumeFrames();
  }
  buffer += decoder.decode();
  consumeFrames();
  if (buffer.trim()) consumeFrame(buffer);

  const text = output || completedOutput;
  if (!output && text) onUpdate(text);
  return text;
}

function requireCompleteResponse(value: unknown): void {
  if (isRecord(value) && value.status === "incomplete") {
    throw new Error("AI_RESPONSE_INCOMPLETE");
  }
}

export function extractResponseOutputText(value: unknown): string {
  if (!isRecord(value)) return "";
  const direct = typeof value.output_text === "string" ? value.output_text : "";
  if (direct.trim()) return direct;
  if (!Array.isArray(value.output)) return direct;
  return value.output.flatMap((item) => {
    if (!isRecord(item) || item.type === "reasoning" || !Array.isArray(item.content)) return [];
    return item.content.flatMap((content) => (
      isRecord(content) && content.type !== "reasoning_text" && typeof content.text === "string"
        ? [content.text]
        : []
    ));
  }).join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
