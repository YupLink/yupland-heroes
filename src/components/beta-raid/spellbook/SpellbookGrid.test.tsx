// Книга героя: «Забыть» есть ТОЛЬКО пока висит эффект «Забвение» — уровень или
// время. Без эффекта, с истёкшим временем и в чужой книге (просмотр героя по
// id) кнопки нет вовсе: забвение даром отменено (владелец, 27.09).
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dict } from "@/lib/translations";

vi.mock("@/lib/i18n", () => ({
  useLang: () => "ru",
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.ru ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? "")),
}));
vi.mock("@/api", () => ({ getMyOblivion: vi.fn() }));
vi.mock("@/lib/hooks/useEnergy", () => ({ useEnergy: () => ({ data: { energy: 99 } }) }));
vi.mock("@/server/api/beta-raid/spell-book", () => ({
  getHeroSpellbook: vi.fn(),
  getOwnedHeroSpellbook: vi.fn(),
}));
vi.mock("@/server/api/beta-raid/spell-cast", () => ({ castSpell: vi.fn() }));
vi.mock("@/server/api/beta-raid/spell-learn", () => ({ forgetSpell: vi.fn() }));

const { SpellbookGrid } = await import("./SpellbookGrid");

const entry = {
  id: "sp_a",
  name: "Огненный шар",
  description: "",
  image: null,
  kind: "boost",
  effects: [],
  energyCost: 5,
  cooldownMinutes: 10,
  baseEnergyCost: 5,
  baseCooldownMinutes: 10,
  minInt: 0,
  active: true,
  readyAt: null,
  cooldownLeftSec: 0,
  canCast: true,
  reasonKey: null,
};
const book = {
  hero: { heroId: "h_me", name: "Воин", spec: null, rarity: "rare", intellect: 10 },
  slots: { total: 3, used: 1, free: 2 },
  discountPercent: 0,
  spells: [entry],
};

function render(oblivion: unknown, props: { heroId?: string; readOnly?: boolean } = {}) {
  const qc = new QueryClient();
  qc.setQueryData(["hero-spellbook"], book);
  if (props.heroId) qc.setQueryData(["hero-spellbook", "view", null, props.heroId], book);
  qc.setQueryData(["my-oblivion"], oblivion);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <SpellbookGrid {...props} />
    </QueryClientProvider>,
  );
}

const soon = () => new Date(Date.now() + 30 * 60_000).toISOString();
const past = () => new Date(Date.now() - 1000).toISOString();

describe("SpellbookGrid — «Забыть» только с эффектом «Забвение»", () => {
  it("без эффекта кнопки нет", () => {
    const html = render({ level: 0, until: null });
    expect(html).toContain("Огненный шар");
    expect(html).not.toContain("Забыть");
  });

  it("уровень есть — кнопка есть", () => {
    expect(render({ level: 2, until: null })).toContain("Забыть");
  });

  it("время висит — есть; истекло — пропала", () => {
    expect(render({ level: 0, until: soon() })).toContain("Забыть");
    expect(render({ level: 0, until: past() })).not.toContain("Забыть");
  });

  it("заряды со сроком: живые — есть; истекли — пропала", () => {
    const lvt = (timedUntil: string) => ({ level: 0, until: null, timedLevel: 2, timedUntil });
    expect(render(lvt(soon()))).toContain("Забыть");
    expect(render(lvt(past()))).not.toContain("Забыть");
  });

  it("часы телефона отстают на 10 минут — по серверу эффект кончился, кнопки нет", () => {
    // Ответ пришёл 2 мин назад по телефону; сервер тогда показывал на 10 мин
    // больше и дал эффекту ещё минуту. По серверу он кончился минуту назад, а
    // телефон без поправки держал бы кнопку ещё девять минут.
    const clientAt = Date.now() - 2 * 60_000;
    const serverNow = clientAt + 10 * 60_000;
    const until = new Date(serverNow + 60_000).toISOString();
    expect(render({ level: 0, until, serverNow, clientAt })).not.toContain("Забыть");
    expect(render({ level: 0, until })).toContain("Забыть");
  });

  it("ответ чужой формы из кэша — кнопки нет, экран жив", () => {
    expect(render("мусор")).not.toContain("Забыть");
    expect(render(undefined)).not.toContain("Забыть");
  });

  it("книга только для чтения — кнопки нет даже с эффектом", () => {
    expect(render({ level: 5, until: null }, { readOnly: true })).not.toContain("Забыть");
  });
});
