// Клетка рюкзака: счётчик «N/CELL_SIZE» у дроби с наград — коротким числом, а не
// 0.2356088130679914/CELL_SIZE (жалоба 27.09.2026), крошка — не «0».
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CELL_SIZE } from "@/lib/hero/backpackCells";

let lang: "ru" | "en" = "ru";
vi.mock("@/lib/i18n", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/i18n")>();
  return {
    ...real,
    useT: () => (key: string, p?: Record<string, string | number>) => real.tFor(lang, key, p),
    useLang: () => lang,
  };
});

// Таймер гриба ходит в react-query — здесь не нужен.
vi.mock("./dmine/DaraiMineTimer", () => ({ DaraiMineTimer: () => null }));

const { FilledCell } = await import("./BackpackCell");

describe("гриб на клетке — имя своего вида", () => {
  const name = (stackKey: string, l: "ru" | "en") => {
    lang = l;
    return renderToStaticMarkup(
      <FilledCell
        cell={{ key: "k#0", stackKey, name: "Гриб DARAI", image: null, units: 1 }}
        onTrash={null}
        onUse={null}
        onInfo={null}
      />,
    );
  };
  it("золотой и алмазный — не «Гриб DARAI»; DARAI и прежние dmine:<id> — DARAI", () => {
    expect(name("dmine:gold", "ru")).toContain("Золотой гриб");
    expect(name("dmine:diamonds", "en")).toContain("Diamond Mushroom");
    expect(name("dmine:darai", "en")).toContain("DARAI Mushroom");
    expect(name("dmine:dm_old", "ru")).toContain("Гриб DARAI");
  });
});

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
  return new RegExp(`font-extrabold text-gold">([^<]*?)/${CELL_SIZE}<`).exec(html)?.[1];
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

describe(`счётчик N/${CELL_SIZE} на клетке рюкзака`, () => {
  it("длинная дробь — до сотых, языком игрока", () => {
    expect(badge(0.2356088130679914)).toBe("0,24");
    expect(badge(7.738083231472352, "en")).toBe("7.74");
  });

  it("крошка — тремя значащими цифрами, целое — как было", () => {
    expect(badge(0.000454660540250266)).toBe("0,000455");
    expect(badge(CELL_SIZE)).toBe(String(CELL_SIZE));
  });
});
