import assert from "node:assert/strict";
import test from "node:test";
import { generateUuid, type UuidCrypto } from "../src/id.ts";

test("uses randomUUID when available", () => {
  const expected = "123e4567-e89b-42d3-a456-426614174000";
  const provider: UuidCrypto = {
    randomUUID: () => expected,
    getRandomValues: () => {
      throw new Error("fallback should not run");
    },
  };

  assert.equal(generateUuid(provider), expected);
});

test("creates a UUID v4 with getRandomValues when randomUUID is unavailable", () => {
  const provider: UuidCrypto = {
    getRandomValues: (array) => {
      array.fill(0);
      return array;
    },
  };

  assert.equal(generateUuid(provider), "00000000-0000-4000-8000-000000000000");
});
