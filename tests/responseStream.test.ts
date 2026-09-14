import assert from "node:assert/strict";
import test from "node:test";
import { readResponseOutput } from "../src/ai/responseStream.ts";

function eventStream(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), { headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
}

test("reassembles split Responses API deltas and reports cumulative text", async () => {
  const updates: string[] = [];
  const response = eventStream([
    'event: response.output_text.delta\ndata: {"type":"response.output_',
    'text.delta","delta":"第一"}\n\nevent: response.output_text.delta\n',
    'data: {"type":"response.output_text.delta","delta":"段"}\n\ndata: [DONE]\n\n',
  ]);

  const output = await readResponseOutput(response, (text) => updates.push(text));

  assert.equal(output, "第一段");
  assert.deepEqual(updates, ["第一", "第一段"]);
});

test("uses a completed response when a compatible server omits delta events", async () => {
  const updates: string[] = [];
  const response = eventStream([
    `event: response.completed\ndata: ${JSON.stringify({
      type: "response.completed",
      response: { output_text: "完整回答" },
    })}\n\n`,
  ]);

  assert.equal(await readResponseOutput(response, (text) => updates.push(text)), "完整回答");
  assert.deepEqual(updates, ["完整回答"]);
});

test("falls back to a normal JSON response when streaming is unsupported", async () => {
  const updates: string[] = [];
  const response = new Response(JSON.stringify({ output_text: "普通回答" }), {
    headers: { "Content-Type": "application/json" },
  });

  assert.equal(await readResponseOutput(response, (text) => updates.push(text)), "普通回答");
  assert.deepEqual(updates, ["普通回答"]);
});
