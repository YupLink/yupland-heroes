// Под общей заставкой экраны загрузки не рисуют второго Юпика.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameLoadState } from "./GameLoadState";
import { SplashCover } from "./splashPolicy";

const render = (covered: boolean, state: "loading" | "error") =>
  renderToStaticMarkup(
    <SplashCover.Provider value={covered}>
      <GameLoadState ru state={state} onRetry={() => {}} />
    </SplashCover.Provider>,
  );

describe("GameLoadState под заставкой", () => {
  it("загрузка под заставкой — пустой фон без Юпика", () => {
    const html = render(true, "loading");
    expect(html).toContain("game-load-state");
    expect(html).not.toContain("game-load-state__runner");
  });

  it("без заставки — с Юпиком, как раньше", () => {
    expect(render(false, "loading")).toContain("game-load-state__runner");
  });

  it("ошибку видно и под заставкой: кнопка «Повторить» на месте", () => {
    expect(render(true, "error")).toContain("Повторить");
  });
});
