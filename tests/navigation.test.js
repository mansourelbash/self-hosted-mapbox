import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePoint,
  project,
  instruction,
  prepareRoute,
  fetchRoute,
} from "../src/navigation.js";
test("coordinate validation preserves longitude, latitude and rejects empty / out-of-range input", () => {
  assert.deepEqual(parsePoint("35.9,31.9"), [35.9, 31.9]);
  for (const v of ["", ",", "181,30", "35,91", "a,5", "1,2,3"])
    assert.throws(() => parsePoint(v));
});
test("projection recognizes midpoint of a long road segment", () => {
  const p = project(
    [35.005, 32],
    [
      [35, 32],
      [35.01, 32],
    ],
  );
  assert.ok(p.distance < 0.01);
  assert.ok(Math.abs(p.along / p.total - 0.5) < 0.001);
  assert.ok(
    project(
      [35.005, 32.002],
      [
        [35, 32],
        [35.01, 32],
      ],
    ).distance > 200,
  );
});
test("Arabic roundabout exit and arrival guidance", () => {
  assert.match(
    instruction({
      maneuver: { type: "roundabout", exit: 3 },
      name: "شارع الجامعة",
    }),
    /المخرج 3/,
  );
  assert.equal(instruction({ maneuver: { type: "arrive" } }), "وصلت إلى وجهتك");
});
test("step offsets accumulate geometry consistently", () => {
  const r = prepareRoute({
    legs: [
      {
        steps: [
          {
            geometry: {
              coordinates: [
                [35, 32],
                [35.01, 32],
              ],
            },
          },
          {
            geometry: {
              coordinates: [
                [35.01, 32],
                [35.02, 32],
              ],
            },
          },
        ],
      },
    ],
  });
  assert.equal(r.steps[0].start, 0);
  assert.ok(r.steps[1].start > 900);
});
test("routing only uses local proxy and handles unreachable routes", async (t) => {
  let url;
  t.mock.method(globalThis, "fetch", async (input) => {
    url = input;
    return { ok: true, json: async () => ({ code: "NoRoute", routes: [] }) };
  });
  await assert.rejects(fetchRoute([35, 32], [36, 33]), /لا يوجد مسار/);
  assert.ok(url.startsWith("/routing/route/v1/driving/35,32;36,33?"));
  assert.ok(url.includes("steps=true"));
});
test("routing reports server failure without fabricated results", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: false }));
  await assert.rejects(fetchRoute([35, 32], [36, 33]), /تعذر حساب المسار/);
});
