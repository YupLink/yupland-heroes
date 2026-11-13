// Инфо выбранного заклинания и итог с минусом (владелец, 28.10.2026): шансы
// текстом (с шагами — пересчитанные), разрушение и предупреждение — только
// если разрушение возможно; «Зачаровано: −12%» красным, «было → стало».
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { EnchantSpell } from "@/lib/enchant/enchant";
import { dict } from "@/lib/translations";

vi.mock("@/lib/i18n", () => ({
  useLang: () => "ru",
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.ru ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? "")),
}));

const { EnchantSpellInfo } = await import("@/components/beta-raid/enchant/EnchantSpellInfo");
const { EnchantResult } = await import("@/components/beta-raid/enchant/EnchantResult");

const SPELL: EnchantSpell = {
  id: "s1",
  name: "Порча",
  rarity: "epic",
  boostMin: -20,
  boostMax: 50,
  success: 50,
  destroy: true,
  destroyChance: 20,
  cost: [{ kind: "resource", code: "gold", amount: 100 }],
  fx: { on: true, pct: 10, cost: { kind: "resource", code: "gold", amount: 10 } },
};
const MINUS = "−";
const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("EnchantSpellInfo", () => {
  it("название цветом редкости, эффект «от −20% до +50%», шансы текстом", () => {
    const out = renderToStaticMarkup(<EnchantSpellInfo spell={SPELL} steps={0} />);
    expect(out).toContain('class="ench-info ench-r-epic"');
    expect(out).toContain("<h5>Порча</h5>");
    expect(text(out)).toContain(`Усиление всех характеристик артефакта: от ${MINUS}20% до +50%`);
    expect(text(out)).toContain("Успех 50% · Без изменений 30% · Разрушение 20%");
    expect(out).toContain('<span class="is-d">Разрушение 20%</span>');
    expect(out).toContain('<p class="ench-warn">Артефакт может исчезнуть навсегда</p>');
    expect(out).not.toMatch(/\+[-−]/);
  });

  it("с шагами усиления — пересчитанные шансы", () => {
    // 50 × (1 + 2 × 10 / 100) = 60; остаток 40 делится 30 : 20 → 24 и 16.
    const out = text(renderToStaticMarkup(<EnchantSpellInfo spell={SPELL} steps={2} />));
    expect(out).toContain("Успех 60% · Без изменений 24% · Разрушение 16%");
  });

  it("без разрушения — ни строки разрушения, ни предупреждения; ровно и ×2", () => {
    const safe = { ...SPELL, destroy: false, destroyChance: 0, boostMin: -10, boostMax: -10 };
    const out = renderToStaticMarkup(<EnchantSpellInfo spell={safe} steps={0} />);
    expect(text(out)).toContain(`Усиление всех характеристик артефакта: ${MINUS}10%`);
    expect(text(out)).toContain("Успех 50% · Без изменений 50%");
    expect(out).not.toContain("Разрушение");
    expect(out).not.toContain("ench-warn");
    const x2 = { ...safe, boostMin: 100, boostMax: 100 };
    expect(text(renderToStaticMarkup(<EnchantSpellInfo spell={x2} steps={0} />))).toContain(
      "артефакта: ×2",
    );
  });
});

describe("EnchantSpellInfo: редкость и превью статов (28.10)", () => {
  it("рядом с названием — редкость словом; без артефакта строк превью нет", () => {
    const out = renderToStaticMarkup(<EnchantSpellInfo spell={SPELL} steps={0} />);
    expect(out).toContain('<span class="ench-rt">Эпическое</span>');
    expect(out).not.toContain("ench-prev");
    expect(out).not.toContain("При успехе");
  });

  it("диапазон −20…+50: «Атака: 10 → 8…15», минус красным, плюс зелёным", () => {
    const out = renderToStaticMarkup(
      <EnchantSpellInfo spell={SPELL} steps={0} stats={{ Attack: 10, Fishing: 4 }} />,
    );
    expect(text(out)).toContain("При успехе");
    expect(text(out)).toContain("Атака: 10 → 8…15");
    expect(out).toContain('<span class="ench-down">8</span>…<span class="ench-up">15</span>');
    expect(text(out)).toContain("Рыбалка: 4 → 4…6");
  });

  it("ровное: одно число; ×2 — удвоение; минус — красным", () => {
    const flat = { ...SPELL, boostMin: 100, boostMax: 100 };
    const x2 = renderToStaticMarkup(
      <EnchantSpellInfo spell={flat} steps={0} stats={{ Attack: 6 }} />,
    );
    expect(text(x2)).toContain("Атака: 6 → 12");
    expect(x2).toContain('<span class="ench-up">12</span>');
    expect(x2).not.toContain("…");
    const minus = { ...SPELL, boostMin: -10, boostMax: -10 };
    const m = renderToStaticMarkup(
      <EnchantSpellInfo spell={minus} steps={0} stats={{ Attack: 10 }} />,
    );
    expect(m).toContain('<span class="ench-down">9</span>');
  });
});

describe("EnchantResult с минусом", () => {
  it("«Зачаровано: −12%» красным и «было → стало» красным", () => {
    const out = renderToStaticMarkup(
      <EnchantResult
        res={{ outcome: "ok", pct: -12, before: { Attack: 10 }, after: { Attack: 9 } }}
        artName="Кольцо"
      />,
    );
    expect(out).toContain('class="ench-result is-bad"');
    expect(out).toContain(`<h5>Зачаровано: ${MINUS}12%</h5>`);
    expect(out).toContain('<span class="ench-down">9</span>');
    expect(text(out)).toContain("10 → 9");
    expect(out).not.toMatch(/\+[-−]/);
  });

  it("плюс — как раньше, зелёным", () => {
    const out = renderToStaticMarkup(
      <EnchantResult
        res={{ outcome: "ok", pct: 15, before: { Attack: 6 }, after: { Attack: 7 } }}
        artName=""
      />,
    );
    expect(out).toContain('class="ench-result is-ok"');
    expect(out).toContain("<h5>Зачаровано: +15%</h5>");
    expect(out).toContain('<span class="ench-up">7</span>');
  });

  it("разрушение — «исчез навсегда», чтобы не путали с ремонтом", () => {
    const out = renderToStaticMarkup(<EnchantResult res={{ outcome: "gone" }} artName="Кольцо" />);
    expect(out).toContain("Артефакт разрушен — исчез навсегда");
  });
});
