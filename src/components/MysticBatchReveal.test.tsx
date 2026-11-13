// Окно итога пачки: суммы количественных призов одной строкой, одинаковые
// артефакты — одна карточка «×n» в уголке, подсказка «куда положили».
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import type { MysticPrize } from "@/server/api/mystic";

vi.mock("@/lib/i18n", () => ({
  useLang: () => "ru",
  useT: () => (k: string, p?: Record<string, unknown>) => (p ? `${k}${JSON.stringify(p)}` : k),
}));
// Портал в тесте — просто содержимое (окружение node, document нет).
vi.mock("react-dom", async (orig) => ({
  ...(await orig<typeof import("react-dom")>()),
  createPortal: (node: ReactNode) => node,
}));
vi.stubGlobal("document", {});

const { MysticBatchReveal } = await import("./MysticBatchReveal");

const ring = (itemId: string): MysticPrize => ({
  kind: "artifact",
  name: "Кольцо",
  image: null,
  rarity: "epic",
  itemId,
});
const prizes: MysticPrize[] = [
  ring("u1"),
  { kind: "energy", amount: 5 },
  ring("u2"),
  { kind: "energy", amount: 10 },
  ring("u3"),
  { kind: "resource", amount: 100, code: "gold" },
];
const render = (inCastle = false) =>
  renderToStaticMarkup(
    <MysticBatchReveal
      title="Bonus Box ×6"
      prizes={prizes}
      onClose={() => {}}
      onViewMysticReward={inCastle ? () => {} : undefined}
    />,
  );

describe("MysticBatchReveal", () => {
  it("энергия — одной строкой с суммой, кольца — одна карточка ×3", () => {
    const out = render();
    expect(out).toContain("Bonus Box ×6");
    expect(out).toContain("chips.prize_energy{&quot;n&quot;:15}");
    expect(out.match(/chips\.prize_energy/g)).toHaveLength(1);
    expect(out.match(/Кольцо/g)).toHaveLength(1);
    expect(out).toContain(">×3<");
    // у суммы «×n» нет: на всё окно ровно один значок
    expect(out.match(/>×\d+</g)).toHaveLength(1);
    expect(out).toContain("chips.mystic_take");
  });

  it("подсказки «куда положили» — как у одиночного окна", () => {
    expect(render()).toContain("chips.mystic_where_items");
    expect(render()).toContain("chips.mystic_where_balance");
    expect(render()).toContain("chips.mystic_where_resources");
    expect(render(true)).toContain("Награда хранится в Таверне.");
  });
});
