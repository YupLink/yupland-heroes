// Карта мира глазами игрока: кружок — только с целой штукой товара «Карта» у
// выбранного героя (без неё кружка нет ни у кого — ни у админа, ни у
// владельца); легенда — строка на каждое поведение построек, только то, что
// есть на карте, со счётом и «Все постройки». ru и en. Рендер на сервере,
// сессия и рюкзак — из кэша.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { encodeRuns, WORLD_MARK_KINDS, type WorldMarkKind } from "@/lib/raid/worldMapCodec";
import type { BackpackStack, BackpackView } from "@/server/api/beta-raid/market-backpack";
import { worldMapModel } from "./worldMapModel";
import type { WorldLayer } from "./worldMapLayers";

const ui = vi.hoisted(() => ({ lang: "ru" as "ru" | "en" }));
vi.mock("react-dom", () => ({ createPortal: (node: ReactNode) => node }));
vi.mock("@/lib/i18n", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/i18n")>();
  return {
    ...real,
    useT: () => (key: string, p?: Record<string, string | number>) => real.tFor(ui.lang, key, p),
    useLang: () => ui.lang,
  };
});
vi.mock("@/server/api/user-auth", () => ({
  getSession: () => Promise.reject(new Error("в тесте сессия — из кэша")),
}));
vi.mock("@/server/api/beta-raid/market-backpack-read", () => ({
  getMyBackpack: () => Promise.reject(new Error("в тесте рюкзак — из кэша")),
}));
vi.mock("@/server/api/beta-raid/world-map", () => ({
  getWorldMap: () => Promise.reject(new Error("в тесте сети нет")),
}));

const { WorldMapButton } = await import("./WorldMapButton");
const { WorldMapLegend } = await import("./WorldMapLegend");

beforeEach(() => {
  ui.lang = "ru";
});

const stack = (over: Partial<BackpackStack>): BackpackStack => ({
  stackKey: "custom:cst_x",
  kind: "custom",
  name: "Карта",
  image: null,
  count: 1,
  cells: 1,
  potion: false,
  collected: 0,
  chest: false,
  ...over,
});

function button(o: { stacks: BackpackStack[]; admin?: boolean; owner?: boolean }) {
  const qc = new QueryClient();
  qc.setQueryData(["session"], { isAdmin: o.admin === true, isPayoutsAdmin: o.owner === true });
  qc.setQueryData(["my-hero-backpack"], { heroId: "h1", stacks: o.stacks } as BackpackView);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <WorldMapButton heroQ={0} heroR={0} castle={{ q: 0, r: 0 }} onPick={() => {}} />
    </QueryClientProvider>,
  );
}

describe("кружок карты мира", () => {
  it("без предмета «Карта» кружка нет — ни у игрока, ни у админа, ни у владельца", () => {
    const axe = stack({ stackKey: "custom:cst_axe", name: "Топор" });
    for (const who of [{}, { admin: true }, { admin: true, owner: true }]) {
      expect(button({ stacks: [], ...who })).toBe("");
      expect(button({ stacks: [axe], ...who })).toBe("");
      // Меньше целой штуки — тоже не карта.
      expect(button({ stacks: [stack({ map: true, count: 0.5 })], ...who })).toBe("");
    }
  });

  it("с целой штукой карты кружок есть; ru и en", () => {
    expect(button({ stacks: [stack({ map: true })] })).toContain('aria-label="Карта мира"');
    ui.lang = "en";
    expect(button({ stacks: [stack({ map: true })], admin: true })).toContain(
      'aria-label="World map"',
    );
  });
});

const K = (k: WorldMarkKind) => WORLD_MARK_KINDS.indexOf(k);

/** Строка r=0, q 0..2 — трава; на ней порталы, поле, склад и прочая постройка. */
const MODEL = worldMapModel({
  mode: "seen",
  q0: 0,
  r0: 0,
  cols: 3,
  rows: 1,
  terrains: [{ id: "g", name: "Трава", img: null }],
  runs: encodeRuns(new Uint16Array([1, 1, 1])),
  marks: [
    ...[K("portal"), 0, 0, K("portal"), 1, 0, K("field"), 2, 0],
    ...[K("warehouse"), 1, 0, K("other"), 0, 0],
  ],
})!;

function legend(hidden: WorldLayer[] = []) {
  return renderToStaticMarkup(
    <WorldMapLegend
      model={MODEL}
      palette={null}
      hidden={new Set(hidden)}
      onToggle={() => {}}
      onToggleAll={() => {}}
    />,
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, "|");

describe("легенда карты мира", () => {
  it("строки — у каждого поведения, что есть на карте, со счётом; лишних нет", () => {
    const t = text(legend());
    expect(t).toContain("|Портал||2|");
    expect(t).toContain("|Поле||1|");
    expect(t).toContain("|Склад||1|");
    expect(t).toContain("|Прочие постройки||1|");
    expect(t).toContain("|Все постройки|");
    // Музея и кладов на этой карте нет — и строк нет; своё — герой и замок — всегда.
    expect(t).not.toContain("Музей");
    expect(t).not.toContain("Клады");
    expect(t).toContain("|Герой|");
    expect(t).toContain("|Замок|");
  });

  it("выключенный вид приглушён; все постройки выключены — и «Все постройки» тоже", () => {
    const one = legend(["portal"]);
    expect(one).toMatch(/aria-pressed="false"[^>]*>(?:(?!<button).)*Портал/);
    expect(one).toMatch(/aria-pressed="true"[^>]*>(?:(?!<button).)*Все постройки/);
    const all = legend(["portal", "field", "warehouse", "other"]);
    expect(all).toMatch(/aria-pressed="false"[^>]*>(?:(?!<button).)*Все постройки/);
  });

  it("по-английски", () => {
    ui.lang = "en";
    const t = text(legend());
    expect(t).toContain("|Portal||2|");
    expect(t).toContain("|Other buildings||1|");
    expect(t).toContain("|All buildings|");
  });
});
