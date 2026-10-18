// Чужой побег рядом со мной: карта правится всегда, а строчка «Цель убежала»
// идёт информационным тостом — выключил «Уведомления в игре», и её нет.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { handleFled } from "./liveFled";
import { readCellDetails, type MapLike } from "./patchMapCache";
import { STATE_KEY } from "./stepCache";
import { synthMap } from "@/test/mapFixture";
import { setGameNotify } from "@/lib/hooks/useGameNotify";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), warning: vi.fn(), error: vi.fn() }),
}));

const MAP_KEY = ["beta-raid-map"];
const fled = { from: "0,0", to: "2,0", objectId: "hare" };
const t = (key: string) => key;

/** Заяц на 0,0, я стою вплотную на 1,0. */
function scene(): QueryClient {
  const qc = new QueryClient();
  qc.setQueryData(
    MAP_KEY,
    synthMap([
      { q: 0, r: 0, objectId: "hare" },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]),
  );
  qc.setQueryData(STATE_KEY, { position: { q: 1, r: 0 } });
  return qc;
}

beforeEach(() => {
  const map = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    },
  });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("handleFled: тост о побеге", () => {
  // С 08.10 сводки по умолчанию выключены, а у включённых есть крестик.
  it("заяц убежал от соседа рядом со мной — «Цель убежала», сквозным тостом с крестиком", () => {
    setGameNotify(true);
    handleFled(scene(), fled, t);
    expect(toast).toHaveBeenCalledWith(
      "braid.target_fled",
      expect.objectContaining({
        className: expect.stringContaining("pointer-events-none"),
        closeButton: true,
      }),
    );
  });

  it("уведомления выключены — тоста нет, а заяц на карте всё равно переехал", () => {
    setGameNotify(false);
    const qc = scene();
    handleFled(qc, fled, t);
    expect(toast).not.toHaveBeenCalled();
    const map = qc.getQueryData(MAP_KEY) as MapLike;
    expect(readCellDetails(map, 0, 0).objectId).toBeNull();
    expect(readCellDetails(map, 2, 0).objectId).toBe("hare");
  });
});
