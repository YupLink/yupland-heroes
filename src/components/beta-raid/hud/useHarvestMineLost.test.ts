// Живое «шахту отняли»: «Добыча», цифра на кружке и флажки перечитываются без
// F5; тоста нет (владелец 04.11, §8.106: уведомления — только в «Добыче»).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { lostDigest } from "@/lib/mineLost";

const s = vi.hoisted(() => ({ toasts: [] as unknown[] }));
vi.mock("sonner", () => ({ toast: (text: unknown) => s.toasts.push(text) }));
vi.mock("@/server/api/beta-raid/harvest-summary", () => ({ getHarvestSummary: vi.fn() }));
vi.mock("@/server/api/gifts", () => ({ getMyGifts: vi.fn() }));

const { handleMineLost } = await import("./useHarvest");
const { requestOpenHarvest, subscribeOpenHarvest } = await import("./harvestOpenBus");

beforeEach(() => {
  s.toasts = [];
});

describe("живое «шахту отняли»", () => {
  it("без тоста; «Добыча», флажки и «Управление шахтами» — перечитать", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const digest = lostDigest([
      { kind: "capture", q: 3, r: 4 },
      { kind: "take", q: 5, r: 6 },
    ]);
    expect(handleMineLost(qc, { type: "mineLost", ...{ digest } })).toBe(true);
    expect(s.toasts).toEqual([]);
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([
      ["beta-raid-harvest"],
      ["beta-raid-mine-flags"],
      ["mine-office"],
    ]);
  });

  it("чужое событие — не наше", () => {
    expect(handleMineLost(new QueryClient(), { type: "built" })).toBe(false);
  });

  it("«открой Добычу» до появления HUD — дождётся подписчика, один раз", async () => {
    const seen: string[] = [];
    requestOpenHarvest();
    const off = subscribeOpenHarvest(() => seen.push("open"));
    await Promise.resolve();
    expect(seen).toEqual(["open"]);
    requestOpenHarvest();
    expect(seen).toEqual(["open", "open"]);
    off();
    const late = subscribeOpenHarvest(() => seen.push("late"));
    await Promise.resolve();
    expect(seen).toEqual(["open", "open"]);
    late();
  });
});
