// «Рамки Telegram»: на сервере и вне мобильного Telegram строки нет вовсе.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TgFrameToggle } from "./TgFrameToggle";

describe("TgFrameToggle", () => {
  it("до проверки Telegram (сервер, браузер) — пусто", () => {
    expect(renderToStaticMarkup(<TgFrameToggle ru />)).toBe("");
  });
});
