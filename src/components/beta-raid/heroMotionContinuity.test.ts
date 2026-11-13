import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleHeroTrip, keepHeroGallop, createHeroRouteVisualState } from './heroMotionContinuity';
const trip = { fromX: 0, fromY: 0, toX: 100, toY: 60, start: 1000 };
test('equal time intervals cover equal distances for every mount speed', () => {
  for (const duration of [253,190,158,127,109]) {
    const points = [0,.25,.5,.75,1].map(k => sampleHeroTrip(trip, 1000+k*duration,duration));
    for(let i=1;i<points.length;i++) {
      assert.equal(points[i].x-points[i-1].x,25);
      assert.equal(points[i].y-points[i-1].y,15);
    }
  }
});
test('clock rollback and delayed frames never move outside accepted segment', () => {
  assert.equal(sampleHeroTrip(trip,900,190).progress,0);
  assert.deepEqual(sampleHeroTrip(trip,2000,190),{progress:1,x:100,y:60});
});
test('junction sampling reaches the shared endpoint, not stale last RAF position', () => {
  const stale=sampleHeroTrip(trip,1180,190);
  const end=sampleHeroTrip(trip,1190,190);
  assert.ok(stale.x<100);
  const next={...trip,fromX:end.x,fromY:end.y,toX:200,toY:120,start:1190};
  assert.equal(sampleHeroTrip(next,1190,190).x,100);
  assert.equal(sampleHeroTrip(next,1285,190).x,150);
});
test('short active-route gaps preserve gallop; stop, network wait and clock reset do not', () => {
  assert.equal(keepHeroGallop(1016,1000,true),true);
  assert.equal(keepHeroGallop(1081,1000,true),false);
  assert.equal(keepHeroGallop(1016,1000,false),false);
  assert.equal(keepHeroGallop(999,1000,true),false);
  assert.equal(keepHeroGallop(1000,null,true),false);
});

test('old async cleanup cannot clear a new screen route', () => {
  const state = createHeroRouteVisualState();
  const oldOwner = Symbol('old'), nextOwner = Symbol('next');
  state.set(true, oldOwner);
  state.set(false, oldOwner);
  state.set(true, nextOwner);
  assert.equal(state.set(false, oldOwner), false);
  assert.equal(state.active(), true);
  assert.equal(state.set(false, nextOwner), true);
  assert.equal(state.active(), false);
});
