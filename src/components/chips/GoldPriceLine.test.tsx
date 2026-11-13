// Цена улучшения в золоте (владелец, 21.10.2026): подпись «Требуется золото: N» со
// значком; нехватка — «Не хватает золота: нужно N, у тебя M», той же фразой, что
// отказ сервера (и на английском — тот же текст, что даёт humanError).
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const st = vi.hoisted(() => ({ lang: "ru" as "ru" | "en" }));
vi.mock("@/lib/i18n", async () => {
  const real = await vi.importActual<typeof import("@/lib/i18n")>("@/lib/i18n");
  return {
    ...real,
    useLang: () => st.lang,
    useT: () => (k: string, p?: Record<string, string | number>) => real.tFor(st.lang, k, p),
  };
});

const { GoldRequiredLine, GoldShortNote, goldShort } = await import("./GoldPriceLine");
const { tFor } = await import("@/lib/i18n");
const { humanError } = await import("@/lib/humanError");
const { useAppStore } = await import("@/lib/store");

const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/\u00a0|\u202f/g, " ");

describe("GoldRequiredLine", () => {
  it("хватает — «Требуется золото: N» со значком золота", () => {
    st.lang = "ru";
    const out = html(<GoldRequiredLine need={1059} have={2000} />);
    expect(out).toContain("Требуется золото:");
    expect(out).toContain("/resources/gold.png");
    expect(out).toContain("1 059");
    expect(out).not.toContain("Не хватает");
  });

  it("не хватает — отказ в форме сервера, без «Требуется»", () => {
    st.lang = "ru";
    const out = html(<GoldRequiredLine need={1059} have={120.7} />);
    expect(out).toContain("Не хватает золота: нужно 1 059, у тебя 120");
    expect(out).toContain('role="status"');
    expect(out).not.toContain("Требуется");
  });

  it("по-английски", () => {
    st.lang = "en";
    expect(html(<GoldRequiredLine need={9} have={50} />)).toContain("Gold required:");
    expect(html(<GoldShortNote need={1059} have={0} />)).toContain(
      "Not enough gold: need 1,059, you have 0",
    );
    st.lang = "ru";
  });

  it("баланс неизвестен — только цена; цена неизвестна — ничего", () => {
    st.lang = "ru";
    expect(html(<GoldRequiredLine need={333} have={null} />)).toContain("Требуется золото:");
    expect(html(<GoldRequiredLine need={null} have={10} />)).toBe("");
  });
});

describe("goldShort", () => {
  it("только когда известны и цена, и баланс", () => {
    expect(goldShort(9, 8.99)).toBe(true);
    expect(goldShort(9, 9)).toBe(false);
    expect(goldShort(null, 0)).toBe(false);
    expect(goldShort(9, null)).toBe(false);
  });
});

describe("фраза окна = фраза отказа сервера", () => {
  it("ru — слово в слово, en — как переводит humanError", () => {
    const server = "Не хватает золота: нужно 1059, у тебя 120";
    expect(tFor("ru", "chips.upg_gold", { need: 1059, have: 120 })).toBe(server);
    useAppStore.setState({ lang: "en" });
    expect(humanError(new Error(server))).toBe(
      tFor("en", "chips.upg_gold", { need: 1059, have: 120 }),
    );
    useAppStore.setState({ lang: "ru" });
  });
});
