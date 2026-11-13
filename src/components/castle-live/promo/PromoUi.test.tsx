// Карточка «что выпало и куда» и форма админа — статичным рендером (ru):
// чипы «куда», «×» у штучного, пустая карточка; строки формы; токен в сетке
// видов — только владельцу. Черновик — promoDraft.test.ts.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/lib/i18n", async (orig) => {
  const m = await orig<typeof import("@/lib/i18n")>();
  return {
    ...m,
    useLang: () => "ru",
    useT: () => (k: string, p?: Record<string, string | number>) => m.tFor("ru", k, p),
  };
});
vi.mock("@/server/api/promo/promo-admin", () => ({}));
vi.mock("@/server/api/promo/promo-redeem", () => ({}));
vi.mock("@/server/api/likes", () => ({}));
vi.mock("@/server/api/admin-payouts", () => ({ listRewardTokens: () => new Promise(() => {}) }));
vi.mock("@/server/api/items", () => ({ adminListItems: () => new Promise(() => {}) }));
vi.mock("@/server/api/beta-raid/market-custom", () => ({
  listCustomItems: () => new Promise(() => {}),
}));
vi.mock("@/server/api/chips-admin", () => ({ adminListChipPacks: () => new Promise(() => {}) }));
vi.mock("@/server/api/packs", () => ({ adminListPacks: () => new Promise(() => {}) }));
vi.mock("@/server/api/mystic", () => ({ adminListMysticPacks: () => new Promise(() => {}) }));
vi.mock("@/server/api/raid-admin", () => ({ adminListBossTemplates: () => new Promise(() => {}) }));

const { PromoResultCard } = await import("./PromoResultCard");
const { PromoCreateForm } = await import("./admin/PromoCreateForm");
const { PromoCodeCard } = await import("./admin/PromoCodeCard");
const { PromoKindGrid } = await import("./admin/PromoKindMenu");
const draft = await import("./admin/promoDraft");

const html = (node: ReactNode) =>
  renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

describe("карточка игрока", () => {
  it("каждая строка: имя, количество и чип «куда легло»", () => {
    const out = html(
      <PromoResultCard
        onDone={() => {}}
        outcome={{
          code: "AUTUMN",
          items: [
            { kind: "resource", ref: "gold", name: null, image: null, amount: 250, where: "balance" },
            { kind: "custom", ref: "cst_w", name: "Пшеница", image: null, amount: 12, where: "backpack" },
            { kind: "boss", ref: "y", name: "Йети", image: null, amount: 1, where: "harvest" },
          ],
        }}
      />,
    );
    expect(out).toContain("Промокод активирован");
    expect(out).toContain("AUTUMN");
    expect(out).toContain("Золото");
    expect(out).toContain("+250");
    expect(out).toContain("×12");
    expect(out).toMatch(/data-where="balance"[^>]*>.*На счёт/);
    expect(out).toMatch(/data-where="backpack"[^>]*>.*В рюкзак/);
    expect(out).toMatch(/data-where="harvest"[^>]*>.*В Добычу/);
  });

  it("ничего не выпало — так и сказано, «Готово» на месте", () => {
    const out = html(<PromoResultCard onDone={() => {}} outcome={{ code: "LUCKY", items: [] }} />);
    expect(out).toContain("В этот раз ничего не выпало");
    expect(out).toContain("Готово");
    expect(out).not.toContain("promo-card__item");
  });
});

describe("форма админа", () => {
  it("строки наград: вид, количество одним полем, шанс, объём; создать — пока выбор не сделан, нельзя", () => {
    const out = html(
      <PromoCreateForm
        canToken={false}
        onCreated={() => {}}
        initial={{
          code: "AUTUMN",
          maxUsers: "",
          lines: [
            { ...draft.lineOfKind("resource"), amount: "10-50" },
            { ...draft.lineOfKind("boss"), amount: "1" },
          ],
        }}
      />,
    );
    expect(out.match(/data-promo-line/g)).toHaveLength(2);
    expect(out).toContain('value="10-50"');
    expect(out).toContain("Сгенерировать");
    expect(out).toContain("Выбери босса");
    expect(out).toContain("Выбери, что именно дать");
    expect(out).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });

  it("код в списке: n / ∞ игроков, выдано / объём, удалить — только невведённый", () => {
    const card = (usedUsers: number) =>
      html(
        <PromoCodeCard
          promo={{
            id: "pcd_1",
            code: "AUTUMN",
            active: true,
            createdBy: "designer.near",
            maxUsers: null,
            usedUsers,
            createdAt: "",
            lines: [
              { idx: 0, kind: "resource", ref: "gold", title: null, image: null, min: 10, max: 50, chance: 25, budget: 5000, given: 1250 },
              { idx: 1, kind: "nothing", ref: null, title: null, image: null, min: 1, max: 1, chance: 75, budget: null, given: 3 },
            ],
          }}
        />,
      );
    const used = card(37);
    expect(used).toContain("10-50");
    // Вес 25 из 25 + 75 — шанс 25 %; «Ничего» — своей строкой, 75 %.
    expect(used).toMatch(/25\s%/);
    expect(used).toContain("Ничего");
    expect(used).toMatch(/75\s%/);
    // Объём золота выбран — его шанс 0 %, «Ничего» — 100 %.
    const spent = html(
      <PromoCodeCard
        promo={{
          id: "pcd_2",
          code: "SPENT",
          active: true,
          createdBy: null,
          maxUsers: null,
          usedUsers: 9,
          createdAt: "",
          lines: [
            { idx: 0, kind: "resource", ref: "gold", title: null, image: null, min: 1, max: 1, chance: 25, budget: 5, given: 5 },
            { idx: 1, kind: "nothing", ref: null, title: null, image: null, min: 1, max: 1, chance: 75, budget: null, given: 4 },
          ],
        }}
      />,
    );
    expect(spent).toMatch(/0\s%/);
    expect(spent).toMatch(/100\s%/);
    expect(used).toMatch(/1\s250/);
    expect(used).toMatch(/5\s000/);
    expect(used).not.toContain("Удалить");
    expect(card(0)).toContain("Создал: designer.near");
    expect(card(0)).toContain("Удалить");
  });
});

describe("сетка видов", () => {
  const grid = (canToken: boolean) =>
    html(<PromoKindGrid value="resource" onPick={() => {}} canToken={canToken} />);

  it("токен видит только владелец; ресурсы и вещи — любой админ", () => {
    expect(grid(false)).not.toContain("Токен");
    expect(grid(false)).toContain("Ресурс");
    expect(grid(false)).toContain("Босс");
    expect(grid(true)).toContain("Токен");
  });
});
