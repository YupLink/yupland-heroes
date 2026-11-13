// Переключатель режима в «Добыче» (владелец, 21.10.2026): у своей работающей
// v2 — три кнопки «Бережно ×1 · Усердно ×2 · На износ ×3», текущий подсвечен,
// срок «ещё …» по часам сервера; сломанная, островная и шахта старого образца —
// без кнопок. Плюс тост смены и новые имена в справочнике. Оба языка.
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { dict } from "@/lib/translations";
import type { MineV2Life } from "@/lib/mineV2Row";
import type { MineRow } from "@/server/api/beta-raid/mine-pendings";

const lang = vi.hoisted(() => ({ now: "ru" as "ru" | "en" }));
const tr = (key: string, vars?: Record<string, string | number>) =>
  (dict[key]?.[lang.now] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? ""));
vi.mock("@/lib/i18n", () => ({ useLang: () => lang.now, useT: () => tr }));
vi.mock("@/lib/humanError", () => ({ humanError: (e: Error) => e.message }));
vi.mock("@/server/api/beta-raid/mine-v2", () => ({ repairMine: vi.fn(), setMineMode: vi.fn() }));
vi.mock("@/lib/hooks/useResources", () => ({ RESOURCES_KEY: ["my-resources"] }));
vi.mock("@/lib/hooks/useEnergy", () => ({ ENERGY_KEY: ["my-energy"] }));
vi.mock("@/lib/hooks/useAccountBalances", () => ({ ACC_BALANCES_KEY: ["acc-balances"] }));
vi.mock("@/lib/hooks/useMinePendings", () => ({ MINE_PENDINGS_KEY: ["mine-pendings"] }));
vi.mock("./useHarvest", () => ({ HARVEST_KEY: ["beta-raid-harvest"] }));
vi.mock("../mine/mineGuardsQuery", () => ({ MINE_GUARDS_KEY: ["beta-raid-mine-guards"] }));

// Мутация — подменная: так видно и «ждём ответа», и куда ушёл вызов.
const mut = vi.hoisted(() => ({
  isPending: false,
  isSuccess: false,
  variables: undefined as { mode: string } | undefined,
  reset: () => {},
  mutate: () => {},
  args: [] as unknown[],
}));
vi.mock("../mine/useMineV2Actions", async (orig) => ({
  ...(await orig<typeof import("../mine/useMineV2Actions")>()),
  useMineSetMode: (...args: unknown[]) => {
    mut.args = args;
    return mut;
  },
}));

const { MineList } = await import("./HarvestLists");
const { modeToastText } = await import("../mine/useMineV2Actions");
const { BUILDINGS_SECTION } = await import("@/components/params-guide/data/guideBuildings");

const H = 3_600_000;
const NOW = Date.parse("2026-10-21T12:00:00Z");
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  lang.now = "ru";
  Object.assign(mut, { isPending: false, isSuccess: false, variables: undefined, args: [] });
});

/** «Бережно», прошло 3,5 дня из 7: до поломки 84 ч. */
const life: MineV2Life = {
  mode: "base",
  lifeLeft: 1,
  lifeAt: new Date(NOW - 84 * H).toISOString(),
  breakAt: NOW + 84 * H,
  broken: false,
};
const row: MineRow = {
  mapId: "alpha",
  floor: "Мир Альфа",
  q: 3,
  r: -4,
  resource: "wood",
  token: null,
  yield: 10,
  claimedHours: 0,
  capturedAt: NOW - 2 * H,
  maxHours: 86,
  stepHours: 1,
  v2: life,
};
const list = (m: MineRow, clock?: { serverNow?: number; clientAt?: number }) =>
  renderToStaticMarkup(<MineList mines={[m]} clock={clock} />);

describe("переключатель режима в «Добыче»", () => {
  it("своя работающая: три режима коротко, текущий подсвечен, срок", () => {
    const out = list(row);
    expect(out).toContain('aria-label="Режим шахты"');
    for (const s of ["Бережно", "Усердно", "На износ", "×1", "×2", "×3"]) expect(out).toContain(s);
    expect(out).toMatch(/aria-checked="true" data-mine-mode="base"/);
    expect(out).toMatch(/aria-checked="false" data-mine-mode="max"/);
    expect(out).toContain("ещё 3 д 12 ч");
    // Вызов уйдёт на карту шахты (другой этаж), а не туда, где стоит игрок.
    expect(mut.args).toEqual([3, -4, undefined, "alpha"]);
  });

  it("по-английски", () => {
    lang.now = "en";
    const out = list({ ...row, v2: { ...life, mode: "mid" } });
    for (const s of ["Steady", "Hard", "Overdrive", "3d 12h left"]) expect(out).toContain(s);
    expect(out).toMatch(/aria-checked="true" data-mine-mode="mid"/);
  });

  it("часы телефона впереди на 10 мин — срок по часам сервера", () => {
    const v2 = { ...life, breakAt: NOW - 5 * 60_000 };
    const out = list({ ...row, v2 }, { serverNow: NOW - 10 * 60_000, clientAt: NOW });
    expect(out).toContain("ещё 5 мин 0 с");
    expect(out).toContain('role="radiogroup"');
  });

  it("ждём ответа: все кнопки выключены, нажатая крутится и подсвечена", () => {
    Object.assign(mut, { isPending: true, variables: { mode: "max" } });
    const out = list(row);
    expect(out.match(/disabled=""/g)).toHaveLength(3);
    expect(out).toMatch(/aria-checked="true" data-mine-mode="max"/);
    expect(out).toContain("animate-spin");
  });

  it("сломанная — «сломана», без кнопок", () => {
    for (const v2 of [
      { ...life, broken: true },
      { ...life, breakAt: NOW - 1 },
    ]) {
      const out = list({ ...row, v2 });
      expect(out).toContain("сломана");
      expect(out).not.toContain("radiogroup");
    }
  });

  it("остров и шахта старого образца — без кнопок", () => {
    const isle = list({ ...row, island: true });
    expect(isle).toContain("ещё 3 д 12 ч");
    expect(isle).not.toContain("radiogroup");
    const old = list({ ...row, v2: null, resource: "token", token: "DARAI", maxHours: null });
    expect(old).not.toContain("radiogroup");
    expect(old).not.toContain("ещё");
  });
});

describe("тост и имена", () => {
  it("тост: новый режим и новый срок", () => {
    expect(modeToastText(tr, { mode: "mid", leftMs: 36 * H })).toBe(
      "Усердно ×2 — сломается через 1 д 12 ч",
    );
    expect(modeToastText(tr, { mode: "base" })).toBe("Режим: Бережно ×1");
    lang.now = "en";
    expect(modeToastText(tr, { mode: "max", leftMs: 12 * H })).toBe(
      "Overdrive ×3 — breaks in 12h 0m",
    );
  });

  it("справочник: таблица режимов шахты с новыми именами", () => {
    const mine = BUILDINGS_SECTION.entries.find((e) => e.id === "mine");
    const names = (mine?.table?.rows ?? []).map((r) => r[0]);
    expect(names.slice(0, 3)).toEqual([
      ["Бережно", "Steady"],
      ["Усердно", "Hard"],
      ["На износ", "Overdrive"],
    ]);
  });
});
