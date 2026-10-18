// Рыбалка глазами игрока (§8.35): на берегу с удочкой в руках — «Забросить»;
// удочка есть, но в руках топор — «Взять Удочка»; без удочки и вдали от воды —
// ничего; рыбачит — отсчёт до поимки и улов, окно — «Хватит». ru и en.
// Рендер на сервере; карта, рюкзак и рыбалка — из кэша.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BackpackStack, BackpackView } from "@/server/api/beta-raid/market-backpack";
import type { FishView } from "@/lib/raid/fishing";
import { shoreAt } from "./shoreAt";

const ui = vi.hoisted(() => ({ lang: "ru" as "ru" | "en" }));
vi.mock("react-dom", () => ({ createPortal: (node: ReactNode) => node }));
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { error: () => {} }) }));
vi.stubGlobal("document", { body: {} });
vi.mock("@/lib/i18n", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/i18n")>();
  return {
    ...real,
    useT: () => (key: string, p?: Record<string, string | number>) => real.tFor(ui.lang, key, p),
    useLang: () => ui.lang,
  };
});
vi.mock("@/lib/hooks/useEnergy", () => ({ useEnergy: () => ({ data: { energy: 10 } }) }));
vi.mock("@/server/api/beta-raid/market-backpack-read", () => ({
  getMyBackpack: () => Promise.reject(new Error("в тесте рюкзак — из кэша")),
}));
vi.mock("@/server/api/beta-raid/main-tool/main-tool-set", () => ({
  setMainTool: () => Promise.reject(new Error("в тесте сети нет")),
}));
vi.mock("@/server/api/user-auth", () => ({ getSession: () => new Promise(() => {}) }));
vi.mock("@/server/api/beta-raid/fishing/fishing", () => ({
  getFishing: () => Promise.reject(new Error("в тесте рыбалка — из кэша")),
  startFishing: () => Promise.reject(new Error("в тесте сети нет")),
  stopFishing: () => Promise.reject(new Error("в тесте сети нет")),
}));

const { FishingButton } = await import("./FishingButton");
const { FishingCard } = await import("./FishingCard");

const ROD = "custom:cst_rod";
const AXE = "custom:cst_axe";
const stack = (key: string, over: Partial<BackpackStack> = {}): BackpackStack => ({
  stackKey: key,
  kind: "custom",
  name: key === ROD ? "Удочка" : "Топор",
  image: null,
  count: 1,
  cells: 1,
  potion: false,
  collected: 0,
  chest: false,
  tool: true,
  rod: key === ROD,
  durability: 75,
  ...over,
});

/** Карта: суша 0,0 и 5,5; вода 1,0. */
const MAP = {
  packed: { q: [0, 1, 5], r: [0, 0, 5], t: [0, 1, 0], terrainIds: ["grass", "lake"] },
  terrains: { grass: { name: "Трава" }, lake: { name: "Вода" } },
};

function view(o: {
  stacks: BackpackStack[];
  main: string | null;
  fish?: FishView;
  at?: number;
  admin?: boolean;
}) {
  const qc = new QueryClient();
  // Рыбалка пока только админам (featureGates): сессия — из кэша.
  qc.setQueryData(["session"], { isAdmin: o.admin ?? true });
  qc.setQueryData(["my-hero-backpack"], {
    heroId: "h1",
    stacks: o.stacks,
    mainTool: o.main,
  } as BackpackView);
  qc.setQueryData(["beta-raid-map"], MAP);
  if (o.fish) qc.setQueryData(["beta-fishing"], o.fish);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <FishingButton q={o.at ?? 0} r={o.at ?? 0} />
    </QueryClientProvider>,
  );
}

const fishing: FishView = {
  fishing: true,
  q: 0,
  r: 0,
  caught: 2,
  tries: 0,
  plan: 1,
  nextInMs: 9 * 60_000,
  got: [],
  more: false,
  ended: null,
};

beforeEach(() => {
  ui.lang = "ru";
});

describe("берег", () => {
  it("своя клетка суша, соседняя вода — берег; вода и суша без воды рядом — нет", () => {
    expect(shoreAt(MAP as never, 0, 0)).toBe(true);
    expect(shoreAt(MAP as never, 1, 0)).toBe(false);
    expect(shoreAt(MAP as never, 5, 5)).toBe(false);
    expect(shoreAt(undefined, 0, 0)).toBe(false);
  });
});

describe("кнопка над картой", () => {
  it("рыбалка открыта всем: у игрока (не админа) на берегу с удочкой — «Забросить»", () => {
    expect(view({ stacks: [stack(ROD)], main: ROD, admin: false })).toContain("Забросить");
  });

  it("на берегу с удочкой в руках — «Забросить» (en — «Cast»)", () => {
    expect(view({ stacks: [stack(ROD)], main: ROD })).toContain("Забросить");
    ui.lang = "en";
    expect(view({ stacks: [stack(ROD)], main: ROD })).toContain("Cast");
  });

  // С a2b7cdf8 (10.10, дизайн Ангелины): без удочки в руках кнопка сначала
  // предлагает взять её, «Забросить» — только когда удочка уже в руках.
  it("удочка одна, руки пусты — «Взять Удочка», а не «Забросить»", () => {
    const out = view({ stacks: [stack(ROD)], main: null });
    expect(out).toContain("Взять Удочка");
    expect(out).not.toContain("Забросить");
  });

  it("в руках топор — «Взять Удочка»", () => {
    const out = view({ stacks: [stack(ROD), stack(AXE)], main: AXE });
    expect(out).toContain("Взять Удочка");
    expect(out).not.toContain("Забросить");
  });

  it("без удочки или не на берегу — ничего", () => {
    expect(view({ stacks: [stack(AXE)], main: AXE })).toBe("");
    expect(view({ stacks: [stack(ROD)], main: ROD, at: 5 })).toBe("");
  });

  it("рыбачит здесь — отсчёт и улов вместо «Забросить»", () => {
    const out = view({ stacks: [stack(ROD)], main: ROD, fish: fishing });
    expect(out).toMatch(/>(9:00|8:59)</);
    expect(out).toContain("×2");
    expect(out).toContain('aria-label="Рыбалка"');
    expect(out).not.toContain("Забросить");
  });
});

describe("окно рыбалки", () => {
  const card = (rod: BackpackStack | null) =>
    renderToStaticMarkup(
      <FishingCard
        rod={rod}
        caught={3}
        leftMs={65_000}
        busy={false}
        onStop={() => {}}
        onClose={() => {}}
      />,
    );

  it("удочка с прочностью, улов, отсчёт и «Хватит»; en — Stop", () => {
    const out = card(stack(ROD, { count: 2 }));
    for (const part of ["Удочка", ">75%<", "×2", "Улов", ">3<", "Ждём", "1:05", "Хватит"]) {
      expect(out).toContain(part);
    }
    ui.lang = "en";
    expect(card(null)).toContain("Stop");
  });
});
