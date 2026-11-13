// Сломанный артефакт в интерфейсе (§8.63 п.3): «Надеть» у сломанного неактивно
// (окно снаряжения героя и лист артефакта в таверне), плашка «Сломан: <имя>»
// над героем — там, где дебафы, даже без единого эффекта. Механика не запущена —
// всё как было. Рендер на сервере (окружение node, без jsdom).
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/lib/i18n", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/i18n")>();
  return {
    ...real,
    useLang: () => "ru",
    useT: () => (key: string, p?: Record<string, unknown>) =>
      p ? `${key}${JSON.stringify(p)}` : key,
  };
});
vi.mock("@/server/api/art-repair/art-broken", () => ({
  getArtBrokenOn: vi.fn(),
  getArtBreakNotices: vi.fn(),
  markArtBreakShown: vi.fn(async () => ({ ok: true, marked: 1 })),
}));
vi.mock("@/server/api/heroes-gear", () => ({ equipArtifact: vi.fn(), getOwnedHeroGear: vi.fn() }));
vi.mock("@/server/api/heroes-select", () => ({ getMySelectedHero: vi.fn() }));
vi.mock("@/lib/hooks/useOblivion", () => ({
  useOblivion: () => ({ level: 0, until: null, timedLevel: 0, timedUntil: null, active: false }),
}));
vi.mock("@/components/castle-live/TavernDialog", () => ({
  TavernDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const { GearSlotDetails } = await import("./castle/GearSlotDetails");
const { TavernArtifactSheet } = await import("@/components/castle-live/TavernArtifactSheet");
const { BetaEffectHud } = await import("./BetaEffectHud");
const { ART_BREAK_NOTICES_KEY, ART_BROKEN_ON_KEY } = await import("@/lib/hooks/useArtBroken");

function render(node: ReactNode, on: boolean, seed?: (qc: QueryClient) => void): string {
  const qc = new QueryClient();
  qc.setQueryData(ART_BROKEN_ON_KEY, { on });
  seed?.(qc);
  return renderToStaticMarkup(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

/** Кнопка, внутри которой этот текст, выключена? */
const disabled = (html: string, text: string): boolean => {
  const at = html.indexOf(text);
  const open = html.lastIndexOf("<button", at);
  return /\sdisabled=""/.test(html.slice(open, html.indexOf(">", open)));
};

const view = (itemId: string, durability: number) => ({
  itemId,
  itemIds: [itemId],
  count: 1,
  templateId: `t_${itemId}`,
  name: `Арт ${itemId}`,
  imageUrl: null,
  rarity: "common",
  slot: "Голова",
  statType: "attack",
  statAmount: 3,
  immunities: [],
  fishBonusPct: 0,
  statKey: "atk" as const,
  parts: [],
  total: 3,
  durability,
});
const slot = { key: "Голова", slot: "Голова", index: 1, item: null };

describe("окно снаряжения: выбор для надевания", () => {
  const html = (on: boolean) =>
    render(
      <GearSlotDetails
        slot={slot}
        candidates={[view("broken", 0), view("whole", 100)]}
        readOnly={false}
        atCastle
        equipPending={false}
        unequipPending={false}
        onEquip={() => {}}
        onUnequip={() => {}}
      />,
      on,
    );

  it("сломанный — с накладкой и неактивен; целый — активен", () => {
    const h = html(true);
    expect(disabled(h, "Арт broken")).toBe(true);
    expect(disabled(h, "Арт whole")).toBe(false);
    expect(h.match(/data-art-broken/g)).toHaveLength(1);
    expect(h.match(/data-art-locked="1"/g)).toHaveLength(1);
  });

  it("механика не запущена — оба активны, накладки нет", () => {
    const h = html(false);
    expect(disabled(h, "Арт broken")).toBe(false);
    expect(h).not.toContain("data-art-broken");
  });
});

describe("таверна: лист артефакта", () => {
  const gear = (durability: number) => ({
    slots: [slot],
    available: { Голова: [view("a1", durability)] },
  });
  const html = (on: boolean, durability: number) =>
    render(
      <TavernArtifactSheet
        artifact={
          {
            id: "a1",
            kind: "artifact",
            name: "Арт a1",
            imageUrl: null,
            rarity: "common",
            slot: "Голова",
            durability,
          } as never
        }
        heroId="h1"
        heroName="Герой"
        canEquip
        onClose={() => {}}
      />,
      on,
      (qc) => qc.setQueryData(["my-hero-gear", "view", "h1"], gear(durability)),
    );

  it("сломанный — «Надеть» неактивна, поверх картинки накладка", () => {
    const h = html(true, 0);
    expect(disabled(h, "Надеть Арт a1")).toBe(true);
    expect(h).toContain("data-art-broken");
  });

  it("целый — «Надеть» активна; механика не запущена — сломанный тоже", () => {
    expect(disabled(html(true, 60), "Надеть Арт a1")).toBe(false);
    expect(disabled(html(false, 0), "Надеть Арт a1")).toBe(false);
  });
});

describe("плашка над героем", () => {
  const notes = [
    { id: "abn_1", itemId: "u1", name: "Меч Ярости", imageUrl: "/m.webp" },
    { id: "abn_2", itemId: "u2", name: "Щит", imageUrl: null },
  ];
  const hud = (on: boolean) =>
    render(<BetaEffectHud slow={null} />, on, (qc) =>
      qc.setQueryData(ART_BREAK_NOTICES_KEY, { items: notes }),
    );

  it("там, где дебафы, — даже без эффектов: иконка арта, значок поломки, «Сломан: имя»", () => {
    const h = hud(true);
    expect(h).toContain("absolute bottom-24 left-2");
    expect(h.match(/data-art-break-notice=/g)).toHaveLength(2);
    expect(h).toContain("artbroken.title");
    expect(h).toContain("Меч Ярости");
    expect(h).toContain("data-art-broken");
    expect(h).toContain('role="status"');
  });

  it("механика не запущена — плашек нет", () => {
    expect(hud(false)).not.toContain("data-art-break-notice");
  });
});
