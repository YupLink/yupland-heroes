import assert from "node:assert/strict";
import test from "node:test";
import { FISHING_IDLE_ORDER, FishingIdleLoop } from "./fishingIdle";
import { cancelHeroAction, getFishingIdleFrame, getHeroAction, interruptFishingIdle, setFishingHold, startHeroAction } from "../heroActionVisual";

test("waiting stops immediately and a new session begins standing", () => {
  setFishingHold(true, { up: true, left: true });
  assert.deepEqual(getHeroAction().fishingFacing, { up: true, left: true });
  assert.equal(getFishingIdleFrame(0)?.index, 0);
  setFishingHold(false);
  assert.equal(getFishingIdleFrame(20_000), null);
  assert.equal(getHeroAction().fishingFacing, null);
  setFishingHold(true, { up: false, left: false });
  assert.equal(getFishingIdleFrame(30_000)?.index, 0);
  interruptFishingIdle();
  assert.equal(getFishingIdleFrame(40_000)?.index, 0);
  setFishingHold(false);
});

test("cast keeps fishing hold, resource actions cancel it", () => {
  setFishingHold(true);
  startHeroAction("fish");
  assert.equal(getHeroAction().fishingHold, true);
  cancelHeroAction();
  startHeroAction("wood");
  assert.equal(getHeroAction().fishingHold, false);
  assert.equal(getFishingIdleFrame(0), null);
  cancelHeroAction();
});

test("atlas contract and deterministic session sequence", () => {
  assert.equal(FISHING_IDLE_ORDER.length, 20);
  const a = new FishingIdleLoop(12345, 0);
  const b = new FishingIdleLoop(12345, 0);
  for (let ms = 0; ms <= 600_000; ms += 500) {
    assert.deepEqual(a.frame(ms), b.frame(ms));
  }
});

test("clock rollback and suspended tab resume with a bounded hold", () => {
  const loop = new FishingIdleLoop(12345, 0);
  loop.frame(300_000);
  const rollback = loop.frame(180_000);
  assert.ok(rollback.index === 0 || rollback.index === 8);
  assert.ok(loop.delayUntilChange(180_000) >= 20_000);
  assert.ok(loop.delayUntilChange(180_000) <= 40_000);
  loop.frame(3_600_000);
  assert.ok(loop.delayUntilChange(3_600_000) >= 20_000);
  assert.ok(loop.delayUntilChange(3_600_000) <= 40_000);
});

test("holds, gestures, pose changes and no consecutive transitions", () => {
  const loop = new FishingIdleLoop(987654, 0);
  let previous = loop.frame(0);
  let since = 0;
  let lastGestureTransition = false;
  let transitions = 0;
  let gestures = 0;
  for (let ms = 100; ms <= 3_600_000; ms += 100) {
    const next = loop.frame(ms);
    if (next.index === previous.index) continue;
    const duration = ms - since;
    if (previous.index === 0 || previous.index === 8) {
      assert.ok(duration >= 20_000 && duration <= 40_100, `hold ${duration}`);
      if (next.transition) {
        assert.equal(lastGestureTransition, false);
        lastGestureTransition = true;
        transitions++;
      } else {
        lastGestureTransition = false;
        gestures++;
      }
    } else {
      assert.ok(duration >= 2_000 && duration <= 4_100, `gesture ${duration}`);
      assert.equal(next.index, next.seated ? 8 : 0);
      if (previous.transition) assert.notEqual(previous.seated, next.seated);
      else assert.equal(previous.seated, next.seated);
    }
    previous = next;
    since = ms;
  }
  assert.ok(transitions > 0);
  assert.ok(gestures > transitions);
});
