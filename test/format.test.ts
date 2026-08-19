import { test } from "node:test";
import * as assert from "node:assert/strict";
import { formatRows } from "../src/utils/format";

test("formatRows: aligns the value column to the longest label plus gutter", () => {
  const lines = formatRows([
    { label: "Files", value: 184 },
    { label: "Circular deps", value: 3 },
  ]);
  assert.equal(lines[0], "Files            184");
  assert.equal(lines[1], "Circular deps      3");
  assert.equal(lines[0].length, lines[1].length);
});
