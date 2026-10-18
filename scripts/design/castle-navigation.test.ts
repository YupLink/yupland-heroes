import assert from "node:assert/strict";
import test from "node:test";
import { gateCamera } from "../../src/components/castle-live/camera";
import { buildingAt } from "../../src/lib/castleMenus";
import { EMPTY_CASTLE_CELL } from "../../src/lib/castleKinds";
import { groupBox } from "../../src/components/castle-editor/hexGeom";
const cells = {
  "0,0": { ...EMPTY_CASTLE_CELL, buildingId: "hall" },
  "2,10": { ...EMPTY_CASTLE_CELL, buildingId: "gate", groupId: "entrance" },
  "3,10": { ...EMPTY_CASTLE_CELL, buildingId: "gate", groupId: "entrance" },
};
test("gates start centered with a 16px bottom inset at phone and desktop sizes", () => {
  for (const [width, height] of [
    [344, 390],
    [1000, 640],
    [640, 180],
  ]) {
    const c = gateCamera(cells, { gate: "gates" }, width, height);
    const [x, y, w, h] = c.viewBox.split(" ").map(Number);
    const scale = c.width / w;
    const gate = groupBox(["2,10", "3,10"]);
    assert.ok(Math.abs((gate.x + gate.w / 2 - x) * scale - c.scrollLeft - width / 2) < 0.001);
    assert.ok(Math.abs(height - (gate.y + gate.h - y) * scale - 16) < 0.001);
    assert.ok(Math.abs(scale - c.height / h) < 0.001);
  }
});
test("any merged cell follows the rendered lead, even with inconsistent data", () => {
  assert.equal(buildingAt(cells, "3,10"), "gate");
  assert.equal(
    buildingAt({ ...cells, "3,10": { ...cells["3,10"], buildingId: "other" } }, "3,10"),
    "gate",
  );
  assert.equal(buildingAt(cells, "15,15"), null);
});
test("empty map has a finite fallback and no false gates", () => {
  const c = gateCamera({}, {}, 360, 400);
  assert.equal(c.hasGates, false);
  assert.ok(c.viewBox.split(" ").every((x) => Number.isFinite(Number(x))));
});

test("reassigning gates to an upper building does not clip lower content", () => {
  const c = gateCamera(cells, { hall: "gates" }, 360, 420);
  const [, y, , h] = c.viewBox.split(" ").map(Number);
  assert.equal(c.gatesAtBottom, false);
  assert.ok(y + h >= groupBox(["2,10", "3,10"]).y + groupBox(["2,10", "3,10"]).h);
});
test("enlarged merged artwork fits completely", () => {
  const scaled = { ...cells, "2,10": { ...cells["2,10"], iconScale: 2 } };
  const c = gateCamera(scaled, { gate: "gates" }, 360, 420);
  const [, y, , h] = c.viewBox.split(" ").map(Number);
  const box = groupBox(["2,10", "3,10"]);
  assert.ok(y + h >= box.y + box.h * 1.5);
});
