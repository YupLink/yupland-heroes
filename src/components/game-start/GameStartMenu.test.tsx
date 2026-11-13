// Меню входа новичка на заставке: «Сложность» (один вариант «Обычная», выбран) и
// «Начать игру», тот же Юпик; подпись загрузки и клетки уступают место меню,
// «загрузка задерживается» под меню не всплывает.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/i18n", () => ({
  useT: () => (k: string) =>
    ({
      "start.new": "Начать игру",
      "start.continue": "Продолжить",
      "start.no_heroes": "Героев нет",
      "start.difficulty": "Сложность",
      "start.difficulty_normal": "Обычная",
    })[k] ?? k,
  useLang: () => "ru",
}));
vi.mock("./GameStartRacePick", () => ({ GameStartRacePick: () => null }));

const { GameStartMenu } = await import("./GameStartMenu");
const { GameLoadState } = await import("@/components/game/GameLoadState");
const { dict } = await import("@/lib/translations/game-start");

const opt = { id: "hero_bee", name: "Fedr", race: "Пчела", image: null };
const splash = (options = [opt]) =>
  renderToStaticMarkup(
    <GameLoadState
      ru
      state="loading"
      menu={<GameStartMenu options={options} onDone={() => {}} />}
    />,
  );

describe("GameStartMenu на заставке", () => {
  it("новичку — «Начать игру», без «Продолжить»", () => {
    expect(splash()).toContain("Начать игру");
    expect(splash()).not.toContain("Продолжить");
  });

  it("новичку — «Сложность» с единственным вариантом «Обычная», он выбран", () => {
    const html = splash();
    expect(html).toContain('role="radiogroup" aria-label="Сложность"');
    expect(html.match(/role="radio"/g)).toHaveLength(1);
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*>Обычная</);
    // «Сложность» стоит и тогда, когда героев на выбор нет.
    expect(splash([])).toContain("Обычная");
  });

  it("«Сложность» переведена на ru и en", () => {
    expect(dict["start.difficulty"]).toEqual({ ru: "Сложность", en: "Difficulty" });
    expect(dict["start.difficulty_normal"]).toEqual({ ru: "Обычная", en: "Normal" });
  });

  it("выбирать не из кого — сказано об этом, и только тогда «Продолжить» без героя", () => {
    const html = splash([]);
    expect(html).toContain("Героев нет");
    expect(html).toContain("Продолжить");
    expect(html).not.toContain("Начать игру");
    expect(splash()).not.toContain("Героев нет");
  });

  it("Юпик тот же, подписи загрузки и клеток нет", () => {
    const html = splash();
    expect(html).toContain("game-load-state__runner--walking");
    expect(html).not.toContain("game-load-state__caption");
    expect(html).not.toContain("game-load-state__cells");
    expect(html).toContain('aria-busy="false"');
  });

  it("без меню заставка прежняя", () => {
    const html = renderToStaticMarkup(<GameLoadState ru state="loading" />);
    expect(html).toContain("game-load-state__caption");
    expect(html).not.toContain("game-start__go");
    expect(html).not.toContain("Сложность");
  });
});
