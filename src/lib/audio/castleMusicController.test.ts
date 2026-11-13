// Музыка не рвётся на кратком «скрытии» вебвью (Telegram перерисовывает шапку,
// системные панели): пауза — только если страница скрыта дольше HIDE_GRACE_MS.
import { afterEach, describe, expect, it, vi } from "vitest";
import { CastleMusicController, HIDE_GRACE_MS, type MusicChannel } from "./castleMusicController";

function fixture() {
  const log: string[] = [];
  const channel: MusicChannel = {
    unlock() {},
    play() {
      log.push("play");
      return Promise.resolve();
    },
    pause(s) {
      log.push(`pause:${s}`);
    },
    dispose(s) {
      log.push(`dispose:${s}`);
    },
  };
  const player = new CastleMusicController(() => channel, undefined, { trackCount: 1 });
  return { player, log };
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("CastleMusicController hide grace", () => {
  afterEach(() => vi.useRealTimers());
  it("a brief hide keeps playing without a restart", async () => {
    vi.useFakeTimers();
    const { player, log } = fixture();
    player.enter();
    await flush();
    expect(player.getSnapshot().playing).toBe(true);
    player.setHidden(true, HIDE_GRACE_MS);
    vi.advanceTimersByTime(HIDE_GRACE_MS - 500);
    player.setHidden(false, HIDE_GRACE_MS);
    vi.advanceTimersByTime(HIDE_GRACE_MS * 2);
    await flush();
    expect(log).toEqual(["play"]);
    expect(player.getSnapshot().playing).toBe(true);
  });
  it("a real departure pauses after the grace and resumes on return", async () => {
    vi.useFakeTimers();
    const { player, log } = fixture();
    player.enter();
    await flush();
    player.setHidden(true, HIDE_GRACE_MS);
    player.setHidden(true, HIDE_GRACE_MS); // repeated events do not stack timers
    vi.advanceTimersByTime(HIDE_GRACE_MS);
    expect(log).toEqual(["play", "pause:0"]);
    expect(player.getSnapshot().playing).toBe(false);
    player.setHidden(false, HIDE_GRACE_MS);
    await flush();
    expect(log).toEqual(["play", "pause:0", "play"]);
    expect(player.getSnapshot().playing).toBe(true);
  });
  it("without grace (overlay with its own audio, pagehide) pauses at once; hidden page never starts", async () => {
    vi.useFakeTimers();
    const { player, log } = fixture();
    player.setHidden(true, HIDE_GRACE_MS); // not playing yet: hidden immediately
    player.enter();
    await flush();
    expect(log).toEqual([]);
    player.setHidden(false);
    await flush();
    player.setHidden(true);
    expect(log).toEqual(["play", "pause:0"]);
  });
});
