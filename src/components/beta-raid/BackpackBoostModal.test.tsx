// Карточка зелья: поле количества и честная кнопка «Использовать».
// Дробь меньше штуки выпить нельзя (правило) — кнопка этого и не обещает.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

vi.mock("react-dom", () => ({ createPortal: (node: ReactNode) => node }));
// Окно — Radix-диалог (#31): его портал без браузера ничего не выводит.
vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const real = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return { ...real, Portal: ({ children }: { children?: ReactNode }) => <>{children}</> };
});
vi.mock("@/lib/i18n", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/i18n")>();
  return {
    ...real,
    useT: () => (key: string, p?: Record<string, string | number>) => real.tFor("ru", key, p),
    useLang: () => "ru",
  };
});
vi.stubGlobal("document", { body: {} });

const { BackpackBoostModal } = await import("./BackpackBoostModal");

const html = (total: number, effects = [{ stat: "spd", value: "1", minutes: "10" }]) =>
  renderToStaticMarkup(
    <BackpackBoostModal
      name="Газировка Товарища"
      image={null}
      total={total}
      effects={effects as never}
      lang="ru"
      busy={false}
      onUse={() => {}}
      onClose={() => {}}
    />,
  );

/** Последняя кнопка окна — «Использовать». */
const useButton = (out: string) => out.slice(out.lastIndexOf("<button"));

describe("карточка зелья", () => {
  it("дробь меньше штуки: кнопка неактивна, поля нет", () => {
    const out = html(0.4);
    expect(useButton(out)).toContain('disabled=""');
    expect(useButton(out)).toContain("Использовать");
    expect(out).not.toContain("<input");
    expect(out).toContain("В рюкзаке: 0,4 шт");
  });

  it("пять штук: поле с единицей, «Все (5)», кнопка активна", () => {
    const out = html(5);
    expect(out).toContain('value="1"');
    expect(out).toContain('inputMode="numeric"');
    expect(out).toContain("Все (5)");
    expect(useButton(out)).not.toContain('disabled=""');
  });

  it("5,6 штук: пить можно пять, дробь не обещаем", () => {
    const out = html(5.6);
    expect(out).toContain("Все (5)");
    expect(out).toContain("В рюкзаке: 5,6 шт");
  });

  it("одна штука: поля нет, кнопка активна", () => {
    const out = html(1);
    expect(out).not.toContain("<input");
    expect(useButton(out)).not.toContain('disabled=""');
  });

  it("еда (сытость): «Съесть», а не «Использовать»", () => {
    const food = [{ stat: "satiety", value: "50", minutes: "" }];
    expect(useButton(html(1, food))).toContain("Съесть");
    expect(html(3, food)).not.toContain("Использовать");
    expect(useButton(html(1))).toContain("Использовать");
  });
});
