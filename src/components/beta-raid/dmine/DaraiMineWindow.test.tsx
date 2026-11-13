// Окно DARAI-шахты (владелец, 22.10.2026): захвата нет — вместо него «Забрать
// в рюкзак» с ценой захвата (и у шахты-блока тоже); хозяину кнопки нет, охрану
// на DARAI-шахту не ставят. «Забрать охрану» у прочих шахт — цена по запасу
// службы шахты: > 50 % — 100, 20–50 % — 200, < 20 % — 300; без запаса — 100.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps, ReactNode } from "react";
import { dict } from "@/lib/translations";

vi.mock("@/lib/i18n", () => ({
  useLang: () => "ru",
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.ru ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? "")),
}));
vi.mock("@/lib/humanError", () => ({ humanError: (e: Error) => e.message }));
vi.mock("@/server/api/beta-raid/mine-capture", () => ({ captureMine: vi.fn() }));
vi.mock("@/server/api/beta-raid/mine-claim", () => ({ claimMine: vi.fn() }));
vi.mock("@/server/api/beta-raid/mine-v2", () => ({ repairMine: vi.fn(), setMineMode: vi.fn() }));
vi.mock("@/server/api/beta-raid/dmine/dmine-take", () => ({ takeDaraiMine: vi.fn() }));
vi.mock("@/server/api/beta-raid/mine-guard-take", () => ({ takeMineGuard: vi.fn() }));
vi.mock("@/lib/hooks/useResources", () => ({
  RESOURCES_KEY: ["my-resources"],
  useResources: () => ({ data: {} }),
}));
vi.mock("@/lib/hooks/useEnergy", () => ({ ENERGY_KEY: ["my-energy"] }));
vi.mock("@/lib/hooks/useAccountBalances", () => ({ ACC_BALANCES_KEY: ["acc-balances"] }));
vi.mock("@/lib/hooks/useMinePendings", () => ({ MINE_PENDINGS_KEY: ["mine-pendings"] }));
vi.mock("../hud/useHarvest", () => ({ HARVEST_KEY: ["beta-raid-harvest"] }));
vi.mock("../mine/mineGuardsQuery", () => ({ MINE_GUARDS_KEY: ["beta-raid-mine-guards"] }));
vi.mock("../mine/MineGuardPicker", () => ({ MineGuardPicker: () => null }));
vi.mock("../mine/MineGuardFight", () => ({ MineGuardFight: () => <i>guard-fight</i> }));

const { MineAction } = await import("../MineAction");
const { MineGuardTakeButton } = await import("../mine/MineGuardTakeButton");

const render = (node: ReactNode) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>,
  );

type Props = ComponentProps<typeof MineAction>;
const darai = (over: Partial<Props>) =>
  render(
    <MineAction
      q={3}
      r={-4}
      resource="token"
      token="Darai"
      yieldAmount={1000}
      captureCost={5}
      mine="enemy"
      capturedAt={null}
      claimedHours={0}
      pending={0}
      guardian={null}
      v2={null}
      can
      reasonKey={null}
      onDone={() => {}}
      {...over}
    />,
  );

describe("«Забрать в рюкзак» гриба DARAI", () => {
  it("чужой или ничей — кнопка «Забрать · ⚡5» вместо захвата", () => {
    const html = darai({});
    expect(html).toContain("Забрать в рюкзак · ⚡5");
    expect(html).not.toContain("Захватить");
    expect(darai({ mine: "free" })).toContain("Забрать в рюкзак · ⚡5");
  });

  it("золотой и алмазный грибы — так же: «Забрать · ⚡5» вместо захвата, своему — без охраны", () => {
    const gold = darai({ resource: "gold", token: null, mushroom: "gold", yieldAmount: 1 });
    expect(gold).toContain("Забрать в рюкзак · ⚡5");
    expect(gold).not.toContain("Захватить");
    const own = darai({
      resource: "diamonds",
      token: null,
      mushroom: "diamonds",
      mine: "own",
      capturedAt: Date.now(),
    });
    expect(own).not.toContain("Поставить охрану");
    expect(own).not.toContain("Забрать в рюкзак");
  });

  it("ускорений нет: ни режимов, ни починки — только добыча 10 000 в час", () => {
    const html = darai({ mine: "own", capturedAt: Date.now(), yieldAmount: 10000 });
    expect(html).toContain("10000");
    expect(html).not.toContain("Усердно");
    expect(html).not.toContain("Починить");
  });

  it("нельзя сейчас (поднимал последним, охрана) — кнопка выключена, причина видна", () => {
    const html = darai({ can: false, reasonKey: "dmine.once" });
    expect(html).toContain("Этот гриб ты уже поднимал");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Забрать в рюкзак/s);
  });

  it("своя — ни «Забрать», ни охраны: только добыча", () => {
    const html = darai({ mine: "own", capturedAt: Date.now() });
    expect(html).not.toContain("Забрать в рюкзак");
    expect(html).not.toContain("Поставить охрану");
  });

  it("созревает (защита на час) — «Созреет через мм:сс» всем, «Забрать» не выключен", () => {
    const ripeAt = Date.now() + 42 * 60_000;
    const html = darai({ ripeAt });
    expect(html).toMatch(/Созреет через 4[12]:\d\d/);
    expect(html).toContain("Забрать в рюкзак · ⚡5");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>.*Забрать в рюкзак/s);
    expect(darai({ ripeAt, mine: "own", capturedAt: Date.now() })).toContain("Созреет через");
    // Созрел или защиты нет — подписи нет; не гриб — тоже.
    expect(darai({ ripeAt: Date.now() - 1 })).not.toContain("Созреет");
    expect(darai({})).not.toContain("Созреет");
    expect(darai({ ripeAt, token: "magicdust" })).not.toContain("Созреет");
  });

  it("обычная шахта — по-прежнему захват и охрана у хозяина", () => {
    expect(darai({ token: "magicdust" })).toContain("Захватить");
    expect(darai({ token: "magicdust", mine: "own", capturedAt: Date.now() })).toContain(
      "Поставить охрану",
    );
  });
});

describe("«Забрать охрану» — цена по запасу службы шахты", () => {
  const button = (life: number | null) =>
    render(<MineGuardTakeButton q={3} r={-4} name="Тролль" life={life} onTaken={() => {}} />);

  it("больше 50 % — 100, от 20 до 50 % — 200, меньше 20 % — 300", () => {
    expect(button(1)).toContain("⚡100");
    expect(button(0.51)).toContain("⚡100");
    expect(button(0.5)).toContain("⚡200");
    expect(button(0.2)).toContain("⚡200");
    expect(button(0.19)).toContain("⚡300");
  });

  it("у шахты нет запаса службы — 100", () => {
    expect(button(null)).toContain("⚡100");
  });
});
