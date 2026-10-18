// Клетка рюкзака: счётчик «N/20» у дроби с наград — коротким числом, а не
// 0.2356088130679914/20 (жалоба 27.09.2026), крошка — не «0».
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

let lang: "ru" | "en" = "ru";
vi.mock("@/lib/i18n", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/i18n")>();
  return {
    ...real,
    useT: () => (key: string, p?: Record<string, string | number>) => real.tFor(lang, key, p),
    useLang: () => lang,
  };
});

const { FilledCell } = await import("./BackpackCell");

const badge = (units: number, l: "ru" | "en" = "ru") => {
  lang = l;
  const html = renderToStaticMarkup(
    <FilledCell
      cell={{ key: "k#0", stackKey: "custom:soda", name: "Газировка", image: null, units }}
      onTrash={() => {}}
      onUse={null}
      onInfo={null}
    />,
  );
  return /font-extrabold text-gold">([^<]*?)\/20</.exec(html)?.[1];
};

describe("прочность инструмента на клетке (28.09)", () => {
  const html = (durability: number | null) => {
    lang = "ru";
    return renderToStaticMarkup(
      <FilledCell
        cell={{
          key: "k#0",
          stackKey: "custom:axe",
          name: "Топор",
          image: null,
          units: 2,
          durability,
        }}
        onTrash={null}
        onUse={null}
        onInfo={null}
      />,
    );
  };
  it("процент текущей штуки; мало — красным; не инструмент — ничего", () => {
    expect(html(75)).toContain(">75%<");
    expect(html(75)).toContain('aria-label="Прочность 75%"');
    expect(html(25)).toMatch(/text-destructive"[^>]*>25%</);
    expect(html(null)).not.toContain("%<");
  });
});

describe("счётчик N/20 на клетке рюкзака", () => {
  it("длинная дробь — до сотых, языком игрока", () => {
    expect(badge(0.2356088130679914)).toBe("0,24");
    expect(badge(7.738083231472352, "en")).toBe("7.74");
  });

  it("крошка — тремя значащими цифрами, целое — как было", () => {
    expect(badge(0.000454660540250266)).toBe("0,000455");
    expect(badge(20)).toBe("20");
  });
});
