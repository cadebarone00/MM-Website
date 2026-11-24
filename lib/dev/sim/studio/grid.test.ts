import assert from "node:assert/strict";
import test from "node:test";
import { fitPhones } from "./grid";

const GAP = 16;
const LABEL = 28;
const PHONE_H = 844;

function assertInside(
  count: number,
  area: { width: number; height: number },
) {
  const r = fitPhones(count, area);
  const { columns, rows, frame } = r;
  assert.ok(
    columns * frame.width + (columns - 1) * GAP <= area.width,
    `width overflow for ${count} in ${area.width}x${area.height}`,
  );
  assert.ok(
    rows * (frame.height + LABEL) + (rows - 1) * GAP <= area.height,
    `height overflow for ${count} in ${area.width}x${area.height}`,
  );
}

test("1 phone is as large as fits, never above 1", () => {
  const big = fitPhones(1, { width: 1600, height: 1000 });
  assert.equal(big.scale, 1);

  const small = fitPhones(1, { width: 800, height: 600 });
  assert.ok(Math.abs(small.scale - (600 - 28) / 844) < 1e-9);
});

test("4 phones make a 2×2 box in a wide-enough area", () => {
  const r = fitPhones(4, { width: 1200, height: 1000 });
  assert.equal(r.columns, 2);
  assert.equal(r.rows, 2);
});

test("8 phones make 4×2 on a wide screen", () => {
  const r = fitPhones(8, { width: 1600, height: 900 });
  assert.equal(r.columns, 4);
  assert.equal(r.rows, 2);
});

test("every frame is inside the area for 1,2,3,4,6,8 phones", () => {
  const areas = [
    { width: 1600, height: 900 },
    { width: 1000, height: 800 },
    { width: 600, height: 400 },
  ];
  for (const area of areas) {
    for (const count of [1, 2, 3, 4, 6, 8]) {
      assertInside(count, area);
    }
  }
});

test("very small area: 8 phones still fit inside the area with scale > 0", () => {
  const area = { width: 600, height: 400 };
  const r = fitPhones(8, area);
  assert.ok(r.scale > 0, `scale was ${r.scale}`);
  assertInside(8, area);
});

test("2 phones make 2 columns", () => {
  const r = fitPhones(2, { width: 1200, height: 1000 });
  assert.equal(r.columns, 2);
  assert.equal(r.rows, 1);
});

test("3 phones make 3 columns", () => {
  const r = fitPhones(3, { width: 1600, height: 1000 });
  assert.equal(r.columns, 3);
  assert.equal(r.rows, 1);
});

test("count 0 gives columns 0", () => {
  const r = fitPhones(0, { width: 1600, height: 900 });
  assert.equal(r.columns, 0);
});

test("frame height is the phone height at the chosen scale", () => {
  const r = fitPhones(1, { width: 800, height: 600 });
  assert.ok(Math.abs(r.frame.height - PHONE_H * r.scale) < 1e-9);
});
