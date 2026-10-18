// Основной инструмент глазами игрока (§8.24): значок над картой — прочность и
// штуки, без основного — нет значка; кнопка лопаты окон — «Закопать» / «Взять
// Лопата» / «Нужна лопата»; карточка — «Сделать основным» / «Убрать из рук»;
// 0 % не показывается нигде (живая штука — не меньше 1 %). ru и en. Рендер на сервере.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BackpackStack, BackpackView } from "@/server/api/beta-raid/market-backpack";
import { dict } from "@/lib/translations";

const ui = vi.hoisted(() => ({ lang: "ru" as "ru" | "en" }));
vi.mock("react-dom", () => ({ createPortal: (node: ReactNode) => node }));
// Карточка инструмента — Radix-окно (#31): его портал без браузера ничего не выводит.
vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const real = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return { ...real, Portal: ({ children }: { children?: ReactNode }) => <>{children}</> };
});
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { error: () => {} }) }));
vi.stubGlobal("document", { body: {} });
vi.mock("@/lib/i18n", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/i18n")>();
  return {
    ...real,
    useT: () => (key: string, p?: Record<string, string | number>) => real.tFor(ui.lang, key, p),
    useLang: () => ui.lang,
  };
});
vi.mock("@/server/api/beta-raid/market-backpack-read", () => ({
  getMyBackpack: () => Promise.reject(new Error("в тесте рюкзак — из кэша")),
}));
vi.mock("@/server/api/beta-raid/main-tool/main-tool-set", () => ({
  setMainTool: () => Promise.reject(new Error("в тесте сети нет")),
}));

const { MainToolBadge } = await import("./MainToolBadge");
const { ShovelButton } = await import("./ShovelButton");
const { ToolCard } = await import("./ToolCard");
const { FilledCell } = await import("@/components/beta-raid/BackpackCell");

const stack = (key: string, over: Partial<BackpackStack> = {}): BackpackStack => ({
  stackKey: key,
  kind: "custom",
  name: key.endsWith("sh") ? "Лопата" : "Топор",
  image: null,
  count: 1,
  cells: 1,
  potion: false,
  collected: 0,
  chest: false,
  tool: true,
  shovel: key.endsWith("sh"),
  durability: 100,
  ...over,
});
const SH = "custom:cst_sh";
const AXE = "custom:cst_axe";

function view(stacks: BackpackStack[], mainTool: string | null, node: ReactNode): string {
  const qc = new QueryClient();
  qc.setQueryData(["my-hero-backpack"], { heroId: "h1", stacks, mainTool } as BackpackView);
  return renderToStaticMarkup(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}
const shovelBtn = (stacks: BackpackStack[], main: string | null) =>
  view(stacks, main, <ShovelButton label="bag.bury" busy={false} onDig={() => {}} className="b" />);

beforeEach(() => {
  ui.lang = "ru";
});

// С #20 «Главная рука» видна всегда: пусто — «Рука», в руке — прочность.
describe("значок основного над картой", () => {
  it("нет основного — пустая рука; есть — прочность и имя", () => {
    const empty = view([stack(SH)], null, <MainToolBadge />);
    expect(empty).toContain('aria-label="Главная рука: пусто"');
    expect(empty).toContain(">Рука<");
    const out = view([stack(SH, { count: 3, durability: 50 })], SH, <MainToolBadge />);
    expect(out).toContain(">50%<");
    expect(out).toContain('aria-label="Главная рука: Лопата"');
  });

  it("0 % не бывает: 0,4 % живой штуки — «1%»; кончилась стопка — рука пустая", () => {
    const out = view([stack(SH, { durability: 0.4 })], SH, <MainToolBadge />);
    expect(out).toContain(">1%<");
    expect(out).not.toContain(">0%<");
    expect(view([stack(SH, { count: 0 })], SH, <MainToolBadge />)).toContain(
      'aria-label="Главная рука: пусто"',
    );
  });

  it("английский", () => {
    ui.lang = "en";
    expect(view([stack(AXE)], AXE, <MainToolBadge />)).toContain('aria-label="Main hand: Топор"');
  });
});

describe("кнопка лопаты в окнах мешочка и сундуков", () => {
  it("лопата в руках — «Закопать»; в руках пусто, лопата одна — тоже", () => {
    expect(shovelBtn([stack(SH)], SH)).toContain("Закопать");
    expect(shovelBtn([stack(SH)], null)).toContain("Закопать");
    expect(shovelBtn([stack(SH)], SH)).not.toContain('disabled=""');
  });

  it("в руках топор — «Взять Лопата», активна; лопаты нет — «Нужна лопата», неактивна", () => {
    const take = shovelBtn([stack(SH), stack(AXE)], AXE);
    expect(take).toContain("Взять Лопата");
    expect(take).not.toContain('disabled=""');
    const none = shovelBtn([stack(AXE)], AXE);
    expect(none).toContain("Нужна лопата");
    expect(none).toContain('disabled=""');
  });
});

describe("карточка инструмента и клетка рюкзака", () => {
  const card = (main: boolean, readOnly = false) =>
    view(
      [stack(AXE)],
      main ? AXE : null,
      <ToolCard
        stack={stack(AXE, { durability: 66 })}
        main={main}
        readOnly={readOnly}
        onClose={() => {}}
      />,
    );

  it("«Сделать основным» / «Убрать из рук»; чужой герой — без кнопки", () => {
    expect(card(false)).toContain("Сделать основным");
    expect(card(true)).toContain("Убрать из рук");
    expect(card(true, true)).not.toContain("Убрать из рук");
    expect(card(false)).toContain(">66%<");
  });

  it("клетка: рука у основного, 0,3 % — «1%», а не «0%»", () => {
    const cell = (durability: number | null, main: boolean) =>
      renderToStaticMarkup(
        <FilledCell
          cell={{
            key: "k#0",
            stackKey: AXE,
            name: "Топор",
            image: null,
            units: 1,
            durability,
            main,
          }}
          onTrash={null}
          onUse={null}
          onInfo={null}
        />,
      );
    expect(cell(0.3, false)).toContain("1%");
    expect(cell(0.3, false)).not.toContain(">0%");
    expect(cell(null, true)).toContain('aria-label="Основной инструмент"');
    expect(cell(null, false)).not.toContain("Основной инструмент");
  });

  it("ru и en заведены для всех ключей инструмента", () => {
    for (const k of Object.keys(dict).filter(
      (k) => k.startsWith("tool.") || k.startsWith("dig."),
    )) {
      expect(dict[k]?.ru, k).toBeTruthy();
      expect(dict[k]?.en, k).toBeTruthy();
    }
  });
});
