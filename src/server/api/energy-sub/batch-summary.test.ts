// Текст итога пачки для бота: сколько обменяно, сколько DARAI пришло, куда легло.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db/mcpClient", () => ({ mcpExec: async () => null }));
vi.mock("../raid-shared", () => ({ sqlStr: (v: string) => `'${v}'` }));

const steps = await import("./batch-steps");
// русская локаль делит разряды неразрывным пробелом — сравниваем по смыслу
const batchSummary = (...a: Parameters<typeof steps.batchSummary>) => steps.batchSummary(...a).replace(/\s/g, " ");

describe("итог пачки в бот", () => {
  it("«$ → карта»: обмен и сколько DARAI пришло в пул (пачка 03.10)", () => {
    const s = batchSummary("sub_usd_map", 13.5, [
      { name: "swap", state: "sending", amount: 13.5, at: "" },
      { name: "swap", state: "done", amount: 13.5, received: 30157528.216726106, hash: "H", at: "" },
      { name: "map", state: "done", amount: 30157528.216726106, at: "" },
    ]);
    expect(s).toBe("$ → карта: обмен 13,5 USDT → 30 157 528,22 DARAI · в пул карты 30 157 528,22 DARAI");
  });

  it("корзина $: обмен в дупло и USDT разработчикам", () => {
    const s = batchSummary("sub_usd", 70, [
      { name: "swap", state: "done", amount: 20, received: 44000000, at: "" },
      { name: "burn", state: "done", amount: 44000000, at: "" },
      { name: "dev", state: "done", amount: 50, at: "" },
    ]);
    expect(s).toBe("корзина $: обмен 20 USDT → 44 000 000 DARAI · в дупло 44 000 000 DARAI · разработчикам 50 USDT");
  });

  it("DARAI-корзины и пачка без шагов", () => {
    expect(batchSummary("sub_dev", 5, [{ name: "dev", state: "done", amount: 5, at: "" }])).toBe(
      "разработчикам DARAI: разработчикам 5 DARAI",
    );
    expect(batchSummary("sub_burn", 7, [])).toBe("сжечь DARAI: 7 DARAI");
  });
});
