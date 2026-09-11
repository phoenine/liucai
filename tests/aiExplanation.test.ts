import assert from "node:assert/strict";
import test from "node:test";
import {
  explainSelection,
  generateExample,
  parseAiExplanation,
  testAiConnection,
  AI_CONCEPT_LIMIT,
  AI_EXPLANATION_LIMIT,
} from "../src/aiExplanation.ts";

const explanation = {
  concept: "RAG",
  explanation: "A model consults **external knowledge** to ground its answer in the article's documents.",
};

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
    input: string;
    reasoning: { effort: string };
    max_output_tokens: number;
  };
  assert.equal(body.model, "local-model");
  assert.match(body.input, /This system uses RAG/);
  assert.equal(body.reasoning.effort, "none");
  assert.equal(body.max_output_tokens, 320);
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

test("generates examples as a separate low-reasoning request", async () => {
  let requestBody: { reasoning: { effort: string }; max_output_tokens: number } | undefined;
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
        output_text: JSON.stringify({ example: "A support bot searches manuals before replying." }),
      }), { status: 200 });
    },
  });
  assert.match(result.example, /support bot/);
  assert.equal(requestBody?.reasoning.effort, "low");
  assert.equal(requestBody?.max_output_tokens, 4096);
});

test("preserves formatting in generated code examples", async () => {
  const codeExample = "```ts\nconst result = await run();\nconsole.log(result);\n```";
  const result = await generateExample({
    type: "LIUCAI_AI_EXAMPLE",
    requestId: "request-1",
    selectedText: "async/await",
    contextText: "Use async/await for asynchronous code.",
    concept: "async/await",
    locale: "en",
  }, {
    getSyncStatus: async () => ({ configured: true, signedIn: true, pendingCount: 0, syncing: false }),
    getConnection: async () => ({ baseUrl: "http://localhost:1234/v1", model: "qwen", apiKey: "" }),
    fetch: async () => new Response(JSON.stringify({
      output_text: JSON.stringify({ example: codeExample }),
    }), { status: 200 }),
  });

  assert.equal(result.example, codeExample);
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

test("hard-limits light explanation length after model output", () => {
  const result = parseAiExplanation({
    output_text: JSON.stringify({
      concept: "一二三四五六七八九十一二三四五六七八九十一二三",
      explanation: "文".repeat(150),
    }),
  }, "zh-CN");
  assert.equal(result.concept.length, AI_CONCEPT_LIMIT["zh-CN"]);
  assert.equal(result.explanation.length, AI_EXPLANATION_LIMIT["zh-CN"]);
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
