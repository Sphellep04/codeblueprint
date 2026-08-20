import { test } from "node:test";
import * as assert from "node:assert/strict";
import { formatRows, formatBar } from "../src/utils/format";

test("formatRows: aligns the value column to the longest label plus gutter", () => {
  const lines = formatRows([
    { label: "Files", value: 184 },
    { label: "Circular deps", value: 3 },
  ]);
  assert.equal(lines[0], "Files            184");
  assert.equal(lines[1], "Circular deps      3");
  assert.equal(lines[0].length, lines[1].length);
});

test("formatBar: value 0 is an empty bar", () => {
  assert.equal(formatBar(0, 10), "░░░░░░░░░░");
});

test("formatBar: value === max is a fully filled bar", () => {
  assert.equal(formatBar(10, 10), "██████████");
});

test("formatBar: max <= 0 is an empty bar regardless of value", () => {
  assert.equal(formatBar(5, 0), "░░░░░░░░░░");
  assert.equal(formatBar(5, -1), "░░░░░░░░░░");
});

test("formatBar: a value beyond max clamps to a fully filled bar", () => {
  assert.equal(formatBar(20, 10), "██████████");
});

test("formatBar: a mid-range value rounds to the nearest block", () => {
  assert.equal(formatBar(4, 10), "████░░░░░░");
});
