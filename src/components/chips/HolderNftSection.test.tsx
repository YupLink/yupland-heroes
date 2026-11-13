// Ввод NFT холдеров (владелец, 21.10.2026): без построенного банка раздела нет
// вовсе — ни кнопки, ни надписи «сначала построй банк»; пока признак не пришёл —
// тоже не видно. Постройка банка перечитывает признак (refreshBank).
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const st = vi.hoisted(() => ({
  info: undefined as { bankBuilt: boolean; contract: string; receiverId: string } | undefined,
  enabled: [] as Array<boolean | undefined>,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey, enabled }: { queryKey: unknown[]; enabled?: boolean }) => {
    if (queryKey[0] === "holder-input-info") return { data: st.info };
    st.enabled.push(enabled);
    return {
      data:
        enabled === false
          ? undefined
          : [{ tokenId: "7", title: "Yupik holder", darai: 3e6, unlockDays: 7, media: null }],
    };
  },
  useMutation: () => ({ isPending: false, mutate: () => {} }),
  useQueryClient: () => ({}),
}));
vi.mock("@/lib/i18n", () => ({ useLang: () => "ru" }));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { success: () => {}, error: () => {} }),
}));
vi.mock("@/server/api/bank/holder-nft", () => ({
  getHolderInputInfo: async () => null,
  listHolderNfts: async () => [],
  stakeHolderNfts: async () => null,
}));
vi.mock("./nftDepositBatch", () => ({ NFT_PER_TX: 10, sendChunkTx: async () => "" }));
vi.mock("@/components/castle-live/bank/bankKeys", () => ({
  HOLDER_INPUT_INFO_KEY: ["holder-input-info"],
}));

const { HolderNftSection } = await import("./HolderNftSection");
const render = () => renderToStaticMarkup(<HolderNftSection />);

describe("HolderNftSection", () => {
  it("банк не построен — раздела нет, Sendler не спрашиваем", () => {
    st.info = { bankBuilt: false, contract: "c", receiverId: "r" };
    st.enabled.length = 0;
    expect(render()).toBe("");
    expect(st.enabled).toEqual([false]);
  });

  it("признак ещё не загрузился — раздела нет", () => {
    st.info = undefined;
    expect(render()).toBe("");
  });

  it("банк построен — раздел с кнопкой «Ввести», без старой надписи", () => {
    st.info = { bankBuilt: true, contract: "c", receiverId: "r" };
    const out = render();
    expect(out).toContain("Юпики-холдеры");
    expect(out).toContain("Ввести");
    expect(out).not.toContain("построй банк");
  });
});
