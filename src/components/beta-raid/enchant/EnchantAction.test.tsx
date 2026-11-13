// Окно лавки зачарования (рендер на сервере, окружение node): вкладки только
// при canEdit, пустая лавка у игрока — коротко, у админа — «+»; ячейки
// заклинаний, − / + усиления, итог цены красным, выбор артефакта с ✦,
// сохранение и попытка уходят запросом нужной формы.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { EnchantArtifactView, EnchantSpellView } from "@/lib/enchant/enchant";
import { dict } from "@/lib/translations";

const api = vi.hoisted(() => ({
  getBetaRaidState: vi.fn(),
  getEnchantShop: vi.fn(),
  listEnchantArtifacts: vi.fn(),
  listEnchantCostOptions: vi.fn(),
  saveEnchantSpells: vi.fn(),
  enchantArtifact: vi.fn(),
}));
vi.mock("@/server/api/beta-raid", () => api);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("react-dom", async (orig) => ({
  ...(await orig<typeof import("react-dom")>()),
  createPortal: (node: unknown) => node,
}));
vi.mock("@/lib/i18n", () => ({
  useLang: () => "ru",
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.ru ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? "")),
}));

const { EnchantAction } = await import("@/components/beta-raid/enchant/EnchantAction");
const { EnchantBoost } = await import("@/components/beta-raid/enchant/EnchantBoost");
const { EnchantArtPicker } = await import("@/components/beta-raid/enchant/EnchantArtPicker");
const { enchantCall } = await import("@/components/beta-raid/enchant/useEnchantRun");
const { saveSpellsCall } = await import("@/components/beta-raid/enchant/useEnchantSave");
const { newDraft, savePayload } = await import("@/components/beta-raid/enchant/enchantDraft");

const AT = { mapId: "world", q: 3, r: 4 };
const cost = (code: string, amount: number, have: number) => ({
  kind: "resource" as const,
  code,
  amount,
  name: code,
  image: null,
  have,
});
const SPELL: EnchantSpellView = {
  id: "s1",
  name: "Эпическое",
  rarity: "epic",
  boostMin: 50,
  boostMax: 90,
  success: 50,
  destroy: true,
  destroyChance: 10,
  cost: [cost("gold", 1500, 20000), cost("diamonds", 2, 1)],
  fx: { on: true, pct: 10, cost: cost("gold", 150, 20000) },
};
const art = (itemId: string, enchant: EnchantArtifactView["enchant"]): EnchantArtifactView => ({
  itemId,
  name: `Арт ${itemId}`,
  image: null,
  rarity: "rare",
  stats: { Attack: 10 },
  enchant,
  equipped: false,
});

function render(el: ReactElement, shop?: { spells: EnchantSpellView[]; canEdit: boolean }) {
  const qc = new QueryClient();
  qc.setQueryData(["beta-raid-state"], { mapId: AT.mapId });
  if (shop) qc.setQueryData(["enchant-shop", AT.mapId, AT.q, AT.r], shop);
  qc.setQueryData(["enchant-cost-options"], []);
  qc.setQueryData(["enchant-artifacts"], [art("a1", null), art("a2", { pct: 20, spellName: "X" })]);
  return renderToStaticMarkup(<QueryClientProvider client={qc}>{el}</QueryClientProvider>);
}

beforeEach(() => vi.clearAllMocks());

describe("EnchantAction", () => {
  it("игрок: без вкладок, ячейка «+», заклинание крупно, кнопка серая без артефакта", () => {
    const out = render(<EnchantAction q={AT.q} r={AT.r} />, { spells: [SPELL], canEdit: false });
    expect(out).not.toContain("Админ");
    expect(out).toContain('aria-label="Выбрать артефакт"');
    expect(out).toContain("+50–90%");
    expect(out).toContain("ench-r-epic");
    expect(out).toContain("Без усиления");
    // Алмазов 1 из 2 — чип красный (и в ячейке, и в итоге).
    expect(out.match(/ench-chip is-short/g)?.length).toBe(2);
    expect(out).toMatch(/<button type="button" class="ench-go" disabled="">/);
  });

  it("пустая лавка: игроку — коротко, админу — вкладка и «+»", () => {
    const out = render(<EnchantAction q={AT.q} r={AT.r} />, { spells: [], canEdit: true });
    expect(out).toContain("Игрок");
    expect(out).toContain("Админ");
    expect(out).toContain("Заклинаний нет");
    expect(out).toContain('aria-label="Новое заклинание"');
  });
});

describe("EnchantBoost", () => {
  it("0 шагов: «−» серая, «Без усиления»", () => {
    const out = render(<EnchantBoost spell={SPELL} steps={0} onSteps={() => {}} />);
    expect(out).toContain('aria-label="Меньше" disabled=""');
    expect(out).not.toContain('aria-label="Больше" disabled=""');
    expect(out).toContain("Без усиления");
  });

  it("5 шагов: «+» серая, шанс было → стало, цена шагов 150 × 31", () => {
    const out = render(<EnchantBoost spell={SPELL} steps={5} onSteps={() => {}} />);
    expect(out).toContain('aria-label="Больше" disabled=""');
    expect(out).toContain("50% → 75%");
    expect(out).toContain("+50%");
    // 4650 — разделитель разрядов по языку стора.
    expect(out).toMatch(/>4[\s,.\u00a0\u202f]?650</);
  });
});

describe("EnchantArtPicker", () => {
  it("все артефакты; зачарованный — ✦ и не выбрать; «Подтвердить» — только при выборе", () => {
    vi.stubGlobal("document", { body: {} });
    const none = render(<EnchantArtPicker value={null} onPick={() => {}} onClose={() => {}} />);
    expect(none).toContain("Арт a1");
    expect(none).toContain("Арт a2");
    expect(none.match(/✦/g)?.length).toBe(1);
    expect(none).toMatch(/class="ench-cell is-locked" aria-pressed="false" disabled="">/);
    expect(none).not.toContain("Подтвердить");
    const picked = render(<EnchantArtPicker value="a1" onPick={() => {}} onClose={() => {}} />);
    expect(picked).toContain("Подтвердить");
    // Зачарованный как «выбранный» кнопку не открывает.
    const locked = render(<EnchantArtPicker value="a2" onPick={() => {}} onClose={() => {}} />);
    expect(locked).not.toContain("Подтвердить");
    vi.unstubAllGlobals();
  });
});

describe("запросы", () => {
  it("«Сохранить»: карта, клетка и список заклинаний без лишних полей", async () => {
    api.saveEnchantSpells.mockResolvedValue({ spells: [] });
    const gold = { kind: "resource" as const, code: "gold", name: "Золото", image: null };
    const d = {
      ...newDraft("Новое", [gold]),
      boost: "50-90",
      success: 40,
      destroy: true,
      destroyChance: 70,
    };
    d.cost = [{ kind: "custom", code: "planks", amount: 3 }];
    await saveSpellsCall(AT, savePayload([d]) ?? []);
    expect(api.saveEnchantSpells).toHaveBeenCalledWith({
      data: {
        mapId: "world",
        q: 3,
        r: 4,
        spells: [
          {
            id: "",
            name: "Новое",
            rarity: "common",
            boostMin: 50,
            boostMax: 90,
            success: 40,
            destroy: true,
            destroyChance: 60,
            cost: [{ kind: "custom", code: "planks", amount: 3 }],
            fx: { on: false, pct: 10, cost: { kind: "resource", code: "gold", amount: 10 } },
          },
        ],
      },
    });
  });

  it("«Зачаровать»: новый opId на каждое нажатие", async () => {
    api.enchantArtifact.mockResolvedValue({ outcome: "none" });
    const v = { spellId: "s1", itemId: "a1", steps: 2 };
    await enchantCall(AT, v);
    await enchantCall(AT, v);
    const [a, b] = api.enchantArtifact.mock.calls.map((c) => c[0].data);
    expect(a).toMatchObject({ mapId: "world", q: 3, r: 4, spellId: "s1", itemId: "a1", steps: 2 });
    expect(typeof a.opId).toBe("string");
    expect(a.opId).not.toBe(b.opId);
  });
});
