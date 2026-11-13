// Поля героя в редакторе: рядом с расой и спецом — выбор способности из списка
// владельца; выбранная видна, пустое — «—».
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const lang = vi.hoisted(() => ({ now: "ru" as "ru" | "en" }));
vi.mock("@/lib/i18n", () => ({ useLang: () => lang.now }));

const { ItemHeroFields } = await import("./ItemHeroFields");

const noop = () => {};
const set = { level: noop, race: noop, specialization: noop, ability: noop, uniq: noop };
const render = (ability: string) =>
  renderToStaticMarkup(
    <ItemHeroFields
      v={{ level: 3, race: "Пчела", specialization: "Маг", ability, uniq: false }}
      set={set}
    />,
  );

describe("ItemHeroFields", () => {
  it("список способностей с пустым пунктом, выбранная отмечена", () => {
    const html = render("fisher");
    expect(html).toContain("Способность");
    for (const ru of ["Животновод", "Рыбак", "Владелец казино", "Дипломат", "Искатель кладов", "Владелец рынков", "Фермер", "Киллер", "Шахтёр"])
      expect(html).toContain(ru);
    expect(html).toMatch(/<option value="fisher" selected="">Рыбак<\/option>/);
  });

  it("по-английски — английские названия", () => {
    lang.now = "en";
    expect(render("")).toContain("Treasure hunter");
    lang.now = "ru";
  });
});
