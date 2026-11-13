// Окно шахты v2 (§8.59): своя работающая — запас, «сломается через», режимы и
// «Починить за»; чужая — только запас; сломанная — «Шахта сломана» и «Починить
// за … и забрать» вместо захвата за энергию; шахта старого образца — как была.
// Подтверждение смены режима — с пересчётом срока. Оба языка в словаре.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps, ReactNode } from "react";
import { dict } from "@/lib/translations";
import { dict as v2Dict } from "@/lib/translations/braid-mine-v2";
import { dict as v2ErrDict } from "@/lib/translations/braid-mine-v2-err";
import type { MineV2View } from "@/lib/mineExtra";
import type { MineV2Stamped } from "@/lib/mineV2Clock";

const lang = vi.hoisted(() => ({ now: "ru" as "ru" | "en" }));
vi.mock("@/lib/i18n", () => ({
  useLang: () => lang.now,
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.[lang.now] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) =>
      String(vars?.[k] ?? ""),
    ),
}));
vi.mock("@/lib/humanError", () => ({ humanError: (e: Error) => e.message }));
vi.mock("@/server/api/beta-raid/mine-capture", () => ({ captureMine: vi.fn() }));
vi.mock("@/server/api/beta-raid/mine-claim", () => ({ claimMine: vi.fn() }));
vi.mock("@/server/api/beta-raid/mine-v2", () => ({ repairMine: vi.fn(), setMineMode: vi.fn() }));
vi.mock("@/lib/hooks/useResources", () => ({
  RESOURCES_KEY: ["my-resources"],
  useResources: () => ({ data: { gold: 5, stone: 0, diamonds: 0, wood: 120 } }),
}));
vi.mock("@/lib/hooks/useEnergy", () => ({ ENERGY_KEY: ["my-energy"] }));
vi.mock("@/lib/hooks/useAccountBalances", () => ({ ACC_BALANCES_KEY: ["acc-balances"] }));
vi.mock("@/lib/hooks/useMinePendings", () => ({ MINE_PENDINGS_KEY: ["mine-pendings"] }));
vi.mock("../hud/useHarvest", () => ({ HARVEST_KEY: ["beta-raid-harvest"] }));
vi.mock("./mineGuardsQuery", () => ({ MINE_GUARDS_KEY: ["beta-raid-mine-guards"] }));
vi.mock("./MineGuardOwnerBlock", () => ({ MineGuardOwnerBlock: () => <i>guard-own</i> }));
vi.mock("./MineGuardFight", () => ({ MineGuardFight: () => <i>guard-fight</i> }));

const { MineAction } = await import("../MineAction");
const { MineModeConfirm } = await import("./MineModePicker");

const H = 3_600_000;
const NOW = Date.parse("2026-10-20T12:00:00Z");
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());

/** «Бережно», прошло 3,5 дня из 7: запас 50 %, до поломки 84 ч. */
const working: MineV2View = {
  mode: "base",
  lifeLeft: 1,
  lifeAt: new Date(NOW - 84 * H).toISOString(),
  breakAt: NOW + 84 * H,
  broken: false,
  stdYield: 10,
  mult: 1,
  repairCost: { gold: 20 },
};
const broken: MineV2View = {
  ...working,
  lifeLeft: 0,
  lifeAt: new Date(NOW).toISOString(),
  breakAt: NOW,
  broken: true,
};

type Props = ComponentProps<typeof MineAction>;
const render = (node: ReactNode) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>,
  );
const mine = (over: Partial<Props>) =>
  render(
    <MineAction
      q={3}
      r={-4}
      resource="wood"
      token={null}
      yieldAmount={10}
      captureCost={10}
      mine="own"
      capturedAt={NOW - 2 * H}
      claimedHours={0}
      maxHours={86}
      pending={20}
      guardian={null}
      v2={working}
      can={false}
      reasonKey={null}
      onDone={() => {}}
      {...over}
    />,
  );

describe("окно шахты v2", () => {
  it("своя работающая: запас, срок, три режима, починка за золото", () => {
    lang.now = "ru";
    const out = mine({});
    expect(out).toContain("10 дерево в час");
    expect(out).toContain("Запас 50 %");
    expect(out).toContain("сломается через 3 д 12 ч");
    for (const m of ["Бережно", "Усердно", "На износ", "×2 · 3 д", "×3 · 1 д"]) {
      expect(out).toContain(m);
    }
    expect(out).toMatch(/Починить за.*alt="золото".*20/);
    expect(out).toContain("Собрать 20 дерево");
    expect(out).not.toContain("Шахта сломана");
  });

  it("режим ×2: стандарт × множитель", () => {
    lang.now = "ru";
    const out = mine({ v2: { ...working, mode: "mid", mult: 2 }, yieldAmount: 20 });
    expect(out).toContain("10 × 2 = 20 дерево в час");
    expect(out).toContain('aria-checked="true"');
  });

  it("чужая работающая: запас виден, режимов и починки нет", () => {
    lang.now = "ru";
    const out = mine({ mine: "enemy", can: true });
    expect(out).toContain("Запас 50 %");
    expect(out).not.toContain("Усердно");
    expect(out).not.toContain("Починить");
    expect(out).toContain("Захватить за 10 энергии");
  });

  it("чужая дальше «второго обзора» (far): ни запаса, ни срока — захват остаётся", () => {
    lang.now = "ru";
    const out = mine({ mine: "enemy", can: true, v2: { ...working, far: true } });
    expect(out).not.toContain("Запас");
    expect(out).not.toContain("сломается через");
    expect(out).toContain("Захватить за 10 энергии");
  });

  it("сломанная: только «Починить за … и забрать», без захвата и боя", () => {
    lang.now = "ru";
    const out = mine({ mine: "free", v2: broken, reasonKey: "braid.mine_broken" });
    expect(out).toContain("Шахта сломана");
    expect(out).toMatch(/Починить за.*20.*и забрать/);
    expect(out).not.toContain("Захватить");
    expect(out).not.toContain("guard-fight");
    expect(out).not.toContain("забрать её можно только починкой");
    // §8.70: разобрать за 100 энергии — у сломанной и ничьей.
    expect(out).toContain("Разобрать · ⚡100");
  });

  it("работающая — разобрать нельзя, кнопки нет", () => {
    lang.now = "ru";
    expect(mine({})).not.toContain("Разобрать");
    expect(mine({ mine: "enemy", can: true })).not.toContain("Разобрать");
  });

  it("срок вышел на часах игрока — окно уже «сломана», хоть сервер ещё нет", () => {
    lang.now = "en";
    const out = mine({ v2: { ...working, breakAt: NOW - 1 } });
    expect(out).toContain("The mine is broken");
    expect(out).toMatch(/Repair for.*and claim/);
    expect(out).toContain("Dismantle · ⚡100");
    expect(out).not.toContain("Collect");
  });

  it("часы телефона впереди на 10 мин — по часам сервера шахта ещё работает", () => {
    lang.now = "ru";
    // Сервер: до поломки 5 мин; телефон ушёл на 10 мин вперёд.
    const ahead: MineV2Stamped = {
      ...working,
      breakAt: NOW - 5 * 60_000,
      serverNow: NOW - 10 * 60_000,
      clientAt: NOW,
    };
    const out = mine({ v2: ahead });
    expect(out).not.toContain("Шахта сломана");
    expect(out).toContain("Собрать");
    expect(out).toContain("сломается через 5 мин 0 с");
  });

  it("шахта старого образца — без запаса и режимов", () => {
    lang.now = "ru";
    const out = mine({ resource: "token", token: "DARAI", v2: null, yieldAmount: 5 });
    expect(out).toContain("5 DARAI в час");
    expect(out).not.toContain("Запас");
    expect(out).not.toContain("Починить");
  });

  it("алмазная: цена починки — дерево и камень", () => {
    lang.now = "en";
    const out = mine({
      resource: "diamonds",
      v2: { ...working, stdYield: 1, repairCost: { wood: 10_000, stone: 1_000 } },
    });
    expect(out).toMatch(/alt="wood".*10,000.*alt="stone".*1,000/);
  });
});

describe("подтверждение режима", () => {
  const confirm = (pick: "max" | "mid") =>
    render(
      <MineModeConfirm
        pick={pick}
        v2={working}
        now={NOW}
        busy={false}
        onApply={() => {}}
        onCancel={() => {}}
      />,
    );
  it("«Бережно» 3,5 дня → «На износ»: сломается через 12 ч", () => {
    lang.now = "ru";
    expect(confirm("max")).toContain(
      "«На износ»: запас пересчитается — сломается через 12 ч 0 мин",
    );
    expect(confirm("max")).toContain("Сменить");
  });
  it("по-английски", () => {
    lang.now = "en";
    expect(confirm("mid")).toContain("“Hard”: life will be recalculated — breaks in 1d 12h");
  });
});

describe("словари шахт v2", () => {
  it("у каждого ключа есть ru и en, ключи не пересекаются", () => {
    for (const [key, v] of Object.entries({ ...v2Dict, ...v2ErrDict })) {
      expect(v.ru, key).toBeTruthy();
      expect(v.en, key).toBeTruthy();
    }
    for (const key of Object.keys(v2Dict)) expect(v2ErrDict[key], key).toBeUndefined();
  });
});
