// Любое действие в банке, включая постройку, перечитывает признак «банк построен»
// для ввода NFT холдеров — раздел появляется без перезагрузки страницы; обмен —
// и график курса (свой обмен виден в последней свече сразу).
import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";

vi.mock("@/lib/hooks/useAccountBalances", () => ({ ACC_BALANCES_KEY: ["acc-balances"] }));
vi.mock("@/lib/hooks/useResources", () => ({ RESOURCES_KEY: ["my-resources"] }));

const { refreshBank, HOLDER_INPUT_INFO_KEY } = await import("./bankKeys");

describe("refreshBank", () => {
  it("перечитывает holder-input-info вместе с ключами банка", async () => {
    const keys: unknown[] = [];
    const qc = { invalidateQueries: async ({ queryKey }: { queryKey: unknown }) => { keys.push(queryKey); } };
    await refreshBank(qc as unknown as QueryClient);
    expect(HOLDER_INPUT_INFO_KEY).toEqual(["holder-input-info"]);
    expect(keys).toContainEqual(["holder-input-info"]);
    expect(keys).toContainEqual(["castle-bank"]);
    expect(keys).toContainEqual(["bank-rate"]);
  });
});
