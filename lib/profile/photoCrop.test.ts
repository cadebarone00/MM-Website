import { test } from "node:test";
import assert from "node:assert/strict";
import { outputSide, PHOTO_OUTPUT_MAX, squareCrop } from "./photoCrop.ts";

test("the framed area becomes a whole-pixel square inside the image", () => {
  assert.deepEqual(squareCrop({ x: 10.4, y: 20.6, width: 300.2, height: 300.7 }, 1000, 800), { x: 10, y: 21, width: 300, height: 300 });
  assert.deepEqual(squareCrop({ x: 0, y: 0, width: 400, height: 380 }, 1000, 800), { x: 0, y: 0, width: 380, height: 380 }, "uneven -> the smaller side");
});

test("a crop touching the edge never reaches outside the image", () => {
  assert.deepEqual(squareCrop({ x: 701, y: 501, width: 300, height: 300 }, 1000, 800), { x: 700, y: 500, width: 300, height: 300 });
  assert.deepEqual(squareCrop({ x: -3, y: -1, width: 900, height: 900 }, 1000, 800), { x: 0, y: 0, width: 800, height: 800 });
});

test("saved size: the framed size, capped at 1024", () => {
  assert.equal(outputSide(300), 300);
  assert.equal(outputSide(4000), PHOTO_OUTPUT_MAX);
  assert.equal(outputSide(0), 1);
});
