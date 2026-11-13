// «Защита на час» глазами игрока (владелец, 22.10.2026): после ручной посадки —
// окно «Защита на час — 5 энергии» с «Защитить» / «Не надо» (ru+en); окно не
// пропадает, когда посажен последний гриб и стопки в рюкзаке больше нет.
// Рендер на сервере.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { dict } from "@/lib/translations";

const v = vi.hoisted(() => ({ lang: "ru" as "ru" | "en" }));

vi.mock("@/lib/i18n", () => ({
  useLang: () => v.lang,
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.[v.lang] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? "")),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("@/server/api/beta-raid/dmine/dmine-protect", () => ({ protectMushroom: vi.fn() }));
vi.mock("@/server/api/beta-raid/dmine/dmine-place", () => ({ placeDaraiMine: vi.fn() }));
vi.mock("@/components/beta-raid/ResourceActionDialog", () => ({
  ResourceActionDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const { DaraiMineProtectOffer } = await import("./DaraiMineProtectOffer");
const { DaraiMinePlacePicker } = await import("./DaraiMinePlacePicker");
const { BackpackPlacePicker } = await import("@/components/beta-raid/BackpackPlacePicker");

const offer = () =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <DaraiMineProtectOffer q={1} r={2} placeOp="abcdef12" onClose={() => {}} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  v.lang = "ru";
  vi.stubGlobal("document", {});
});

describe("предложение «Защита на час»", () => {
  it("ru: заголовок с ценой и две кнопки", () => {
    const html = offer();
    expect(html).toContain("Защита на час — 5 энергии");
    expect(html).toContain("Защитить");
    expect(html).toContain("Не надо");
  });

  it("en", () => {
    v.lang = "en";
    const html = offer();
    expect(html).toContain("One-hour protection — 5 energy");
    expect(html).toContain("Protect");
    expect(html).toContain("No thanks");
  });

  it("гриб — по ключу стопки: последний посажен, стопки нет — окно посадки не закрывается", () => {
    for (const key of ["dmine:darai", "dmine:gold", "dmine:diamonds"]) {
      const el = BackpackPlacePicker({ stackKey: key, stacks: [], onClose: () => {} });
      expect(el?.type).toBe(DaraiMinePlacePicker);
    }
    expect(BackpackPlacePicker({ stackKey: "dmine:", stacks: [], onClose: () => {} })).toBeNull();
  });
});
