// Редакторы «Забвения» по правилу 28.09: поле уровня больше не гаснет при
// минутах, «0» или пусто без минут — строка ошибки под эффектом (ru и en), а
// «Сохранить» у формы заклинания и товара маркета неактивна.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dict } from "@/lib/translations";
import type { BoostEffect } from "@/lib/hero/boost";

const lang = vi.hoisted(() => ({ now: "ru" as "ru" | "en" }));

vi.mock("@/lib/i18n", () => ({
  useLang: () => lang.now,
  useT: () => (key: string) => dict[key]?.[lang.now] ?? key,
}));
vi.mock("@/server/api/admin-payouts", () => ({ listRewardTokens: async () => [] }));
vi.mock("@/server/api/beta-raid/market-custom", () => ({
  createCustomItem: vi.fn(),
  updateCustomItem: vi.fn(),
}));

const { BoostEffectsEditor } = await import("./market/BoostEffectsEditor");
const { AdminOblivionEditor } = await import("./AdminOblivionEditor");
const { MarketCustomCreate } = await import("./market/MarketCustomCreate");
const { SpellEditor } = await import("@/components/admin/spells/SpellEditor");
const { EMPTY_SPELL } = await import("@/components/admin/spells/spellDraft");

const html = (el: ReactElement) =>
  renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{el}</QueryClientProvider>);
const obl = (value: string, minutes: string): BoostEffect => ({ stat: "oblivion", value, minutes });
const ERR_RU = "Задай время или количество использований (уровень)";
/** Атрибут disabled, а не класс «disabled:opacity-50». */
const DISABLED = /\sdisabled=""/;
const ERR_EN = "Set a duration or a number of uses (level)";
const effects = (list: BoostEffect[]) =>
  html(<BoostEffectsEditor effects={list} onChange={() => {}} />);

describe("BoostEffectsEditor — эффект «Забвение»", () => {
  it("«0» или пусто без минут — строка ошибки под эффектом", () => {
    expect(effects([obl("0", "")])).toContain(ERR_RU);
    expect(effects([obl("", "")])).toContain(ERR_RU);
    expect(effects([obl("0-3", "30")])).toContain(ERR_RU);
  });

  it("верные пары — без ошибки; поле уровня при минутах не гаснет", () => {
    for (const e of [obl("3", ""), obl("2", "30"), obl("0", "30")]) {
      const out = effects([e]);
      expect(out).not.toContain(ERR_RU);
      expect(out).not.toMatch(DISABLED);
    }
  });

  it("подсказка уровня и ошибка — на языке админа", () => {
    expect(effects([obl("", "")])).toContain('placeholder="0 — без счёта, 1 или 1-3"');
    expect(effects([obl("", "")])).toContain('placeholder="пусто — без срока"');
    lang.now = "en";
    try {
      const out = effects([obl("0", "")]);
      expect(out).toContain(ERR_EN);
      expect(out).toContain('placeholder="0 — unlimited, 1 or 1-3"');
      expect(out).toContain('placeholder="empty — no expiry"');
    } finally {
      lang.now = "ru";
    }
  });
});

describe("AdminOblivionEditor — храм в режиме бога", () => {
  const temple = (level: string, minutes: string) =>
    html(
      <AdminOblivionEditor
        config={{ oblivion: { prices: [], level, minutes } }}
        onSave={() => {}}
      />,
    );

  it("«0» или пусто без времени — строка ошибки", () => {
    expect(temple("0", "")).toContain(ERR_RU);
    expect(temple("", "")).toContain(ERR_RU);
  });

  it("«0» со временем и N — без ошибки; уровень при времени не гаснет", () => {
    expect(temple("0", "30")).not.toContain(ERR_RU);
    expect(temple("2", "")).not.toContain(ERR_RU);
    expect(temple("2", "30")).not.toMatch(DISABLED);
  });
});

/** Главная кнопка формы: «Сохранить»/«Создать товар» — последняя кнопка разметки. */
const saveButton = (markup: string) => {
  const all = markup.match(/<button[^>]*>/g) ?? [];
  return all[all.length - 1] ?? "";
};

describe("«Сохранить» неактивна при неверном забвении", () => {
  const spell = (list: BoostEffect[]) =>
    html(
      <SpellEditor
        value={{ ...EMPTY_SPELL, name: "Забвение", effects: list }}
        onChange={() => {}}
        onSave={() => {}}
        saving={false}
        onClose={() => {}}
      />,
    );

  it("заклинание", () => {
    expect(saveButton(spell([obl("0", "")]))).toMatch(DISABLED);
    expect(saveButton(spell([obl("1", "")]))).not.toMatch(DISABLED);
    expect(saveButton(spell([obl("0", "30")]))).not.toMatch(DISABLED);
  });

  it("свой товар маркета", () => {
    const item = (boost: BoostEffect[] | null) =>
      html(
        <MarketCustomCreate
          onCreated={() => {}}
          editing={{ id: "cst_1", name: "Зелье", image: null, boost }}
        />,
      );
    expect(saveButton(item([obl("", "")]))).toMatch(DISABLED);
    expect(saveButton(item([obl("2", "30")]))).not.toMatch(DISABLED);
    expect(saveButton(item(null))).not.toMatch(DISABLED);
  });
});
