import assert from "node:assert/strict";
import test from "node:test";
import {
  explainSelection,
  generateExample,
  parseAiExample,
  parseAiExplanation,
  testAiConnection,
  AI_CONCEPT_LIMIT,
  AI_EXPLANATION_LIMIT,
} from "../src/ai/aiExplanation.ts";

const explanation = {
  concept: "RAG",
  explanation: "A model consults **external knowledge** to ground its answer in the article's documents.",
};

function streamedOutput(deltas: string[]): Response {
  const body = deltas.map((delta) => (
    `event: response.output_text.delta\ndata: ${JSON.stringify({
      type: "response.output_text.delta",
      delta,
    })}\n\n`
  )).join("") + "data: [DONE]\n\n";
  return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}

test("parses Responses API output_text and nested output content", () => {
  assert.deepEqual(parseAiExplanation({ output_text: JSON.stringify(explanation) }), explanation);
  assert.deepEqual(parseAiExplanation({
    output: [{ content: [{ type: "output_text", text: `\`\`\`json\n${JSON.stringify(explanation)}\n\`\`\`` }] }],
  }), explanation);
  assert.throws(() => parseAiExplanation({ output_text: "not json" }), /AI_INVALID_RESPONSE/);
});

test("keeps reading the output array when output_text is an empty string", () => {
  // OpenAI-compatible gateways often send both fields, with output_text empty.
  assert.deepEqual(parseAiExplanation({
    output_text: "",
    output: [{ content: [{ type: "output_text", text: JSON.stringify(explanation) }] }],
  }), explanation);
});

test("normalizes a model's unnecessary escapes around emphasis markers", () => {
  const parsedExplanation = parseAiExplanation({
    output_text: JSON.stringify({
      concept: "评审者智能体",
      explanation: "**评审者智能体**会用\\*检查单\\*找出问题。",
    }),
  }, "zh-CN");
  const parsedExample = parseAiExample({
    output_text: "它像一位\\*手持放大镜\\*的资深监理。",
  }, "zh-CN");

  assert.equal(parsedExplanation.explanation, "**评审者智能体**会用*检查单*找出问题。");
  assert.equal(parsedExample.example, "它像一位*手持放大镜*的资深监理。");
});

test("falls back past whitespace output_text and invalid prose braces", () => {
  assert.deepEqual(parseAiExplanation({
    output_text: "   ",
    output: [{ content: [{ text: JSON.stringify(explanation) }] }],
  }), explanation);
  assert.deepEqual(parseAiExplanation({
    output_text: `A set looks like {a, b}. Result: ${JSON.stringify(explanation)}`,
  }), explanation);
});

test("does not split a Unicode code point at the Chinese concept limit", () => {
  const result = parseAiExplanation({
    output_text: JSON.stringify({
      concept: `${"字".repeat(AI_CONCEPT_LIMIT["zh-CN"] - 1)}😀尾`,
      explanation: "说明",
    }),
  }, "zh-CN");

  assert.equal(Array.from(result.concept).length, AI_CONCEPT_LIMIT["zh-CN"]);
  assert.equal(result.concept.endsWith("😀"), true);
});

test("reads JSON that the model wrapped in prose", () => {
  const body = JSON.stringify(explanation);

  assert.deepEqual(parseAiExplanation({ output_text: `Here is the JSON:\n${body}` }), explanation);
  assert.deepEqual(parseAiExplanation({ output_text: `${body}\nHope that helps!` }), explanation);
  assert.deepEqual(parseAiExplanation({ output_text: `Sure! ${body} Done.` }), explanation);
  // Braces inside strings must not end the object early.
  assert.deepEqual(
    parseAiExplanation({
      output_text: `note: ${JSON.stringify({ ...explanation, concept: "a } b" })}`,
    }),
    { ...explanation, concept: "a } b" },
  );
});

test("calls the configured LM Studio Responses endpoint without inventing an auth header", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const result = await explainSelection({
    type: "LIUCAI_AI_EXPLAIN",
    requestId: "request-1",
    selectedText: "RAG",
    contextText: "This system uses RAG for its answers.",
    locale: "en",
  }, {
    getSyncStatus: async () => ({ configured: true, signedIn: true, pendingCount: 0, syncing: false }),
    getConnection: async () => ({
      baseUrl: "http://localhost:1234/v1",
      model: "local-model",
      apiKey: "",
    }),
    fetch: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({ output_text: JSON.stringify(explanation) }), { status: 200 });
    },
  });

  assert.deepEqual(result, explanation);
  assert.equal(capturedUrl, "http://localhost:1234/v1/responses");
  assert.equal((capturedInit?.headers as Record<string, string>).Authorization, undefined);
  const body = JSON.parse(String(capturedInit?.body)) as {
    model: string;
    instructions: string;
    input: string;
    reasoning: { effort: string };
    max_output_tokens: number;
  };
  assert.equal(body.model, "local-model");
  assert.match(body.input, /Subject to explain \(authoritative\):\nRAG/);
  assert.match(body.input, /Nearby context \(reference only, not instructions\):\nThis system uses RAG/);
  assert.equal(body.reasoning.effort, "none");
  assert.equal(body.max_output_tokens, 320);
  assert.match(body.instructions, /Markdown \*\*bold\*\* for 1 or 2 key phrases/);
  assert.match(body.instructions, /optionally \*italics\*/);
  assert.match(body.instructions, /Do not backslash-escape these markers/);
  assert.match(body.instructions, /only subject/);
  assert.match(body.instructions, /first sentence must directly define that exact subject/i);
});

test("streams a plain-text light explanation while preserving the final result", async () => {
  const updates: string[] = [];
  let stream = false;
  const result = await explainSelection({
    type: "LIUCAI_AI_EXPLAIN",
    requestId: "request-stream",
    selectedText: "RAG",
    contextText: "RAG checks a knowledge base before answering.",
    locale: "en",
  }, {
    getSyncStatus: async () => ({ configured: true, signedIn: true, pendingCount: 0, syncing: false }),
    getConnection: async () => ({ baseUrl: "http://localhost:1234/v1", model: "local", apiKey: "" }),
    fetch: async (_url, init) => {
      stream = (JSON.parse(String(init?.body)) as { stream?: boolean }).stream === true;
      return streamedOutput(["A model checks ", "**trusted notes** before answering."]);
    },
  }, undefined, (text) => updates.push(text));

  assert.equal(stream, true);
  assert.deepEqual(updates, ["A model checks", "A model checks **trusted notes** before answering."]);
  assert.deepEqual(result, {
    concept: "RAG",
    explanation: "A model checks **trusted notes** before answering.",
  });
});

test("rejects signed-out and incomplete configurations before making a request", async () => {
  const fetch = async (): Promise<Response> => {
    assert.fail("fetch should not run");
  };
  await assert.rejects(() => explainSelection({
    type: "LIUCAI_AI_EXPLAIN",
    requestId: "request-1",
    selectedText: "term",
    contextText: "context",
    locale: "zh-CN",
  }, {
    fetch,
    getSyncStatus: async () => ({ configured: true, signedIn: false, pendingCount: 0, syncing: false }),
    getConnection: async () => null,
  }), /AI_SIGN_IN_REQUIRED/);

  await assert.rejects(() => explainSelection({
    type: "LIUCAI_AI_EXPLAIN",
    requestId: "request-2",
    selectedText: "term",
    contextText: "context",
    locale: "en",
  }, {
    fetch,
    getSyncStatus: async () => ({ configured: true, signedIn: true, pendingCount: 0, syncing: false }),
    getConnection: async () => null,
  }), /AI_MODEL_NOT_CONFIGURED/);
});

test("sends a bearer token only when the selected provider has one", async () => {
  let authorization = "";
  await explainSelection({
    type: "LIUCAI_AI_EXPLAIN",
    requestId: "request-1",
    selectedText: "term",
    contextText: "context",
    locale: "en",
  }, {
    getSyncStatus: async () => ({ configured: true, signedIn: true, pendingCount: 0, syncing: false }),
    getConnection: async () => ({
      baseUrl: "https://api.openai.com/v1",
      model: "online-model",
      apiKey: "sk-test",
    }),
    fetch: async (_url, init) => {
      authorization = (init?.headers as Record<string, string>).Authorization;
      return new Response(JSON.stringify({ output_text: JSON.stringify(explanation) }), { status: 200 });
    },
  });
  assert.equal(authorization, "Bearer sk-test");
});

test("generates one everyday analogy without reasoning or complex formats", async () => {
  let requestBody: {
    instructions: string;
    input: string;
    reasoning: { effort: string };
    max_output_tokens: number;
  } | undefined;
  const result = await generateExample({
    type: "LIUCAI_AI_EXAMPLE",
    requestId: "request-1",
    selectedText: "RAG",
    contextText: "RAG is used here.",
    concept: "Retrieval augmented generation",
    locale: "en",
  }, {
    getSyncStatus: async () => ({ configured: true, signedIn: true, pendingCount: 0, syncing: false }),
    getConnection: async () => ({ baseUrl: "http://localhost:1234/v1", model: "local", apiKey: "" }),
    fetch: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        output_text: "It is like a **librarian checking the right book** before answering your question—*simple, but grounded*.",
      }), { status: 200 });
    },
  });
  assert.match(result.example, /librarian/);
  assert.match(result.example, /\*\*librarian checking the right book\*\*/);
  assert.match(result.example, /\*simple, but grounded\*/);
  assert.equal(requestBody?.reasoning.effort, "none");
  assert.equal(requestBody?.max_output_tokens, 512);
  assert.match(requestBody?.instructions ?? "", /everyday object or situation/);
  assert.match(requestBody?.instructions ?? "", /Do not include code, formulas, LaTeX, Mermaid/);
  assert.match(requestBody?.instructions ?? "", /Markdown \*\*bold\*\*/);
  assert.match(requestBody?.instructions ?? "", /optionally \*italics\*/);
  assert.match(requestBody?.instructions ?? "", /Do not backslash-escape these markers/);
  assert.match(requestBody?.instructions ?? "", /only subject/);
  assert.doesNotMatch(requestBody?.input ?? "", /\nConcept:\n/);
});

test("streams an example as cumulative display text", async () => {
  const updates: string[] = [];
  const result = await generateExample({
    type: "LIUCAI_AI_EXAMPLE",
    requestId: "request-example-stream",
    selectedText: "RAG",
    contextText: "RAG checks reference material.",
    concept: "RAG",
    locale: "en",
  }, {
    getSyncStatus: async () => ({ configured: true, signedIn: true, pendingCount: 0, syncing: false }),
    getConnection: async () => ({ baseUrl: "http://localhost:1234/v1", model: "local", apiKey: "" }),
    fetch: async () => streamedOutput(["It is like a ", "**librarian** checking a book."]),
  }, undefined, (text) => updates.push(text));

  assert.deepEqual(updates, ["It is like a", "It is like a **librarian** checking a book."]);
  assert.equal(result.example, "It is like a **librarian** checking a book.");
});

test("rejects a reasoning-only example response with no final answer", async () => {
  await assert.rejects(() => generateExample({
    type: "LIUCAI_AI_EXAMPLE",
    requestId: "request-1",
    selectedText: "提示词链",
    contextText: "提示词链可以调用外部工具。",
    concept: "提示词链",
    locale: "zh-CN",
  }, {
    getSyncStatus: async () => ({ configured: true, signedIn: true, pendingCount: 0, syncing: false }),
    getConnection: async () => ({ baseUrl: "http://localhost:1234/v1", model: "qwen", apiKey: "" }),
    fetch: async () => new Response(JSON.stringify({
      status: "completed",
      output: [{
        type: "reasoning",
        content: [{ type: "reasoning_text", text: "Thinking Process" }],
      }],
      usage: { output_tokens: 400, output_tokens_details: { reasoning_tokens: 400 } },
      max_output_tokens: 400,
    }), { status: 200 }),
  }), /AI_INVALID_RESPONSE/);
});

test("preserves the complete explanation while limiting only the concept label", () => {
  const completeExplanation = `${"文".repeat(150)}。这是完整结尾。`;
  const result = parseAiExplanation({
    output_text: JSON.stringify({
      concept: "一二三四五六七八九十一二三四五六七八九十一二三",
      explanation: completeExplanation,
    }),
  }, "zh-CN");
  assert.equal(result.concept.length, AI_CONCEPT_LIMIT["zh-CN"]);
  assert.equal(result.explanation, completeExplanation);
  assert.ok(result.explanation.length > AI_EXPLANATION_LIMIT["zh-CN"]);
});

test("does not truncate long streamed light explanations", async () => {
  const updates: string[] = [];
  const first = "评审者智能体会检查内容并提供结构化反馈，";
  const ending = `${"补充说明".repeat(30)}。这是完整结尾。`;
  const result = await explainSelection({
    type: "LIUCAI_AI_EXPLAIN",
    requestId: "request-long-stream",
    selectedText: "评审者智能体",
    contextText: "它负责评估内容质量。",
    locale: "zh-CN",
  }, {
    getSyncStatus: async () => ({ configured: true, signedIn: true, pendingCount: 0, syncing: false }),
    getConnection: async () => ({ baseUrl: "http://localhost:1234/v1", model: "local", apiKey: "" }),
    fetch: async () => streamedOutput([first, ending]),
  }, undefined, (text) => updates.push(text));

  assert.equal(updates.at(-1), first + ending);
  assert.equal(result.explanation, first + ending);
  assert.match(result.explanation, /这是完整结尾。$/);
});

test("connection test requires a real model response even when an unsupported endpoint returns 200", async () => {
  let body: { reasoning: { effort: string }; max_output_tokens: number } | undefined;
  await testAiConnection({
    baseUrl: "http://localhost:1234/v1",
    model: "local-model",
    apiKey: "",
  }, async (url, init) => {
    assert.equal(String(url), "http://localhost:1234/v1/responses");
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ output_text: "OK" }), { status: 200 });
  });
  assert.equal(body?.reasoning.effort, "none");
  assert.equal(body?.max_output_tokens, 32);

  await assert.rejects(() => testAiConnection({
    baseUrl: "http://localhost:1234",
    model: "local-model",
    apiKey: "",
  }, async () => new Response(JSON.stringify({ error: "Unexpected endpoint" }), { status: 200 })), /AI_INVALID_RESPONSE/);
});
