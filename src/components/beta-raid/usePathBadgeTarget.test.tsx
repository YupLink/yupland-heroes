// Плашка маршрута к декору: надпись действия шаблона («Срубить · 9 шагов» и
// кнопка «Срубить»), язык игрока, нет en — ru, нет вовсе — прежнее «Уничтожить».
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Lang } from "@/lib/store";
import type { Cell } from "./unpackMap";

// Список приходит из кэша (его кладёт тап по декору); в сеть тест не ходит.
vi.mock("@/server/api/beta-raid/decor-interact", () => ({
  getInteractiveDecor: () => Promise.reject(new Error("в тесте списка из сети нет")),
}));

const { usePathBadgeTarget } = await import("./usePathBadgeTarget");

const path = [
  { q: 0, r: 0, cost: 1 },
  { q: 1, r: 0, cost: 1 },
];
const tree = (label?: { ru?: string; en?: string }) => ({
  decoration_pine: { cost: 5, itemId: "cst_wood", amount: "1-2", name: "Ель", label },
});

function Probe({ lang, cells }: { lang: Lang; cells: Record<string, Cell> }) {
  const target = usePathBadgeTarget(
    { pendingPath: path, pendingAction: { kind: "decor", q: 2, r: 0, extraCost: 5 }, cells },
    lang,
    100,
  );
  return <b>{target?.actionLabel}</b>;
}

const label = (lang: Lang, list: unknown, decorId: string | null = "decoration_pine") => {
  const qc = new QueryClient();
  qc.setQueryData(["interactive-decor"], list);
  const out = renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <Probe lang={lang} cells={{ "2,0": { decorationId: decorId } }} />
    </QueryClientProvider>,
  );
  return /<b>(.*)<\/b>/.exec(out)?.[1];
};

describe("usePathBadgeTarget — надпись действия декора", () => {
  it("своя надпись шаблона на языке игрока", () => {
    const list = tree({ ru: "Срубить", en: "Chop" });
    expect(label("ru", list)).toBe("Срубить");
    expect(label("en", list)).toBe("Chop");
  });

  it("нет en — ru", () => {
    expect(label("en", tree({ ru: "Срубить" }))).toBe("Срубить");
  });

  it("нет надписи, чужой декор или пустая клетка — прежнее «Уничтожить» / «Destroy»", () => {
    expect(label("ru", tree())).toBe("Уничтожить");
    expect(label("en", tree())).toBe("Destroy");
    expect(label("ru", tree({ ru: "Срубить" }), "decoration_other")).toBe("Уничтожить");
    expect(label("ru", tree({ ru: "Срубить" }), null)).toBe("Уничтожить");
    // Список ещё не приехал (или старый кэш без поля) — тоже прежнее.
    expect(label("ru", undefined)).toBe("Уничтожить");
  });
});

// Лопата в руках (§8.24): маршрут «дойти и …» лопатой пишет дело из предложения
// лопаты («Закопать · N шагов»), без него — «Копать»; «копать под собой» — плашка
// без маршрута с ценой дела.
const { shovelOffer } = await import("./tool/shovelOffer");

type Step = { q: number; r: number; cost: number };
function Dig({ steps }: { steps: Step[] }) {
  const action = steps.length ? { kind: "dig" as const, q: 2, r: 0, extraCost: 2 } : null;
  const target = usePathBadgeTarget({ pendingPath: steps, pendingAction: action, cells: {} }, "ru", 100);
  if (!target) return <b>none</b>;
  return <b>{`${target.actionLabel ?? "-"}|${target.cost}|${target.here === true}`}</b>;
}
const dig = (steps: Step[]) => {
  const out = renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <Dig steps={steps} />
    </QueryClientProvider>,
  );
  return /<b>(.*)<\/b>/.exec(out)?.[1];
};

describe("usePathBadgeTarget — дело лопаты", () => {
  it("надпись дела из предложения лопаты по клетке дела, иначе «Копать»; цена — путь и 2⚡", () => {
    shovelOffer.set({ q: 2, r: 0, act: "bury", near: false, here: false });
    expect(dig(path)).toBe("Закопать|4|false");
    shovelOffer.set({ q: 9, r: 9, act: "unbury", near: false, here: false });
    expect(dig(path)).toBe("Копать|4|false");
    shovelOffer.set(null);
  });

  it("«копать под собой» — плашка без маршрута; предложения нет — плашки нет", () => {
    expect(dig([])).toBe("none");
    shovelOffer.set({ q: 0, r: 0, act: "dig", near: true, here: true });
    expect(dig([])).toBe("-|2|true");
    shovelOffer.set(null);
  });
});
