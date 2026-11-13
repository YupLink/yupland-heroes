// Кнопка «Съесть · награда» (§8.85): числа владельца на языке игрока; перед
// съедением — цена ⚡50 и «Подтвердить».
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dict } from "@/lib/translations";

const lang = vi.hoisted(() => ({ v: "ru" as "ru" | "en" }));
vi.mock("@/lib/i18n", () => ({
  useLang: () => lang.v,
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.[lang.v] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? "")),
}));
vi.mock("@/server/api/beta-raid/dmine/dmine-eat", () => ({ eatMushroom: vi.fn() }));
vi.mock("./useDaraiMines", () => ({ invalidateDaraiMines: vi.fn() }));

const { DaraiMineEatButton, EatConfirm } = await import("./DaraiMineEatButton");
const render = (stackKey: string) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <DaraiMineEatButton stackKey={stackKey} />
    </QueryClientProvider>,
  ).replace(/ | /g, " ");

describe("«Съесть» в окне гриба", () => {
  it("алмазный — 5 алмазов, золотой — 5 золота, DARAI — 25 000", () => {
    lang.v = "ru";
    expect(render("dmine:diamonds")).toContain("Съесть · 5 алмазов");
    expect(render("dmine:gold")).toContain("Съесть · 5 золота");
    expect(render("dmine:darai")).toContain("Съесть · 25 000 DARAI");
  });
  it("по-английски", () => {
    lang.v = "en";
    expect(render("dmine:darai")).toContain("Eat · 25,000 DARAI");
  });
  it("не гриб — кнопки нет", () => {
    expect(render("custom:x")).toBe("");
  });
});

describe("подтверждение перед съедением", () => {
  it("цена и награда, «Отмена» и «Подтвердить»", () => {
    lang.v = "ru";
    const html = renderToStaticMarkup(
      <EatConfirm
        text={(dict["dmine.eat_confirm"].ru as string)
          .replace("{n}", "50")
          .replace("{reward}", "5 алмазов")}
        cancel={dict["common.cancel"].ru as string}
        confirm={dict["common.confirm"].ru as string}
        busy={false}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(html).toContain("Съесть гриб за ⚡50? Получишь 5 алмазов");
    expect(html).toContain("Отмена");
    expect(html).toContain("Подтвердить");
  });
  it("до подтверждения — только кнопка «Съесть», без списания", () => {
    lang.v = "ru";
    const html = render("dmine:gold");
    expect(html).toContain("Съесть · 5 золота");
    expect(html).not.toContain("data-eat-confirm");
  });
});
