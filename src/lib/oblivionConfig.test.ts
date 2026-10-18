// Настройка постройки «Забвение»: черновик для формы админа и рабочая настройка
// для игры — клетка важнее шаблона, без цены не работает, пара «уровень +
// минуты» — по правилу 28.09 (неверная не выдаёт ничего).
import { describe, expect, it } from "vitest";
import { checkCellOblivion, EMPTY_OBLIVION, oblivionConfigDraft } from "./oblivionConfig";

const gold = (amount: number) => ({ resource: "gold" as const, amount });

describe("oblivionConfigDraft — форма админа", () => {
  it("пустая клетка — пустой черновик: уровень 1, без времени", () => {
    expect(oblivionConfigDraft(null)).toEqual(EMPTY_OBLIVION);
    expect(oblivionConfigDraft({ effect: "oblivion" })).toEqual(EMPTY_OBLIVION);
  });

  it("строки цены не выбрасываются, даже пустые — иначе исчезали бы под пальцем", () => {
    const draft = oblivionConfigDraft({ oblivion: { prices: [gold(0)], level: "", minutes: 30 } });
    expect(draft).toEqual({ prices: [gold(0)], level: "", minutes: "30" });
  });
});

describe("checkCellOblivion — что работает в игре", () => {
  it("клетка важнее шаблона", () => {
    const chk = checkCellOblivion(
      { oblivion: { prices: [gold(5)], level: "2" } },
      { oblivion: { prices: [gold(99)], level: "9" } },
    );
    expect(chk).toEqual({ ok: true, cfg: { prices: [gold(5)], level: "2", minutes: "" } });
  });

  it("цены нет или только нули — не настроено", () => {
    const notSet = { ok: false, reasonKey: "oblivion.not_set" };
    expect(checkCellOblivion({ oblivion: { prices: [], level: "2" } }, null)).toEqual(notSet);
    expect(checkCellOblivion({ oblivion: { prices: [gold(0)] } }, null)).toEqual(notSet);
    expect(checkCellOblivion(null, null)).toEqual(notSet);
  });

  it("три вида: заряды, заряды со сроком, «0» — без счёта на время", () => {
    const cfg = (level: string, minutes: string) =>
      checkCellOblivion({ oblivion: { prices: [gold(1)], level, minutes } }, null);
    expect(cfg("3", "")).toMatchObject({ ok: true, cfg: { level: "3", minutes: "" } });
    expect(cfg("2", "10-20")).toMatchObject({ ok: true, cfg: { level: "2", minutes: "10-20" } });
    expect(cfg("0", "30")).toMatchObject({ ok: true, cfg: { level: "0", minutes: "30" } });
  });

  it("неверная пара, уже лежащая в базе, — «настроено с ошибкой», ничего не выдаётся", () => {
    const bad = { ok: false, reasonKey: "oblivion.bad_setup" };
    const cfg = (level: string, minutes: string) =>
      checkCellOblivion({ oblivion: { prices: [gold(1)], level, minutes } }, null);
    expect(cfg("0", "")).toEqual(bad);
    expect(cfg("", "")).toEqual(bad);
    expect(cfg("ноль", "-")).toEqual(bad);
    expect(cfg("0-3", "30")).toEqual(bad);
  });

  it("у шаблона без поля уровня — 1, как показывает форма", () => {
    const chk = checkCellOblivion({}, { oblivion: { prices: [gold(1)], minutes: "30" } });
    expect(chk).toMatchObject({ ok: true, cfg: { level: "1", minutes: "30" } });
  });
});
