import assert from "node:assert/strict";
import test from "node:test";
import { appendNote, formatAiExplanationNote, MAX_NOTE_LENGTH } from "../src/aiNote.ts";

const explanation = {
  concept: "检索增强生成",
  explanation: "回答前先查资料，这里指引用**当前知识库**。",
};

test("formats localized AI notes and preserves an existing note", () => {
  const block = formatAiExplanationNote(explanation, "zh-CN", "客服机器人先搜索产品手册。");
  assert.match(block, /^AI 解释｜检索增强生成/);
  assert.match(block, /这里指引用\*\*当前知识库\*\*。/);
  assert.equal(appendNote("我的批注", block), `我的批注\n\n${block}`);
  assert.equal(appendNote("", block), block);
});

test("rejects an append that would exceed the note limit without truncating it", () => {
  const existing = "字".repeat(MAX_NOTE_LENGTH - 3);

  assert.throws(() => appendNote(existing, "新增内容"), /NOTE_TOO_LONG/);
  assert.equal(appendNote("原文", "新增"), "原文\n\n新增");
});
