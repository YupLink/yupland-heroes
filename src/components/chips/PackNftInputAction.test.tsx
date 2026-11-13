// «Внести NFT» — только с подключённым кошельком: у входа Telegram/Google (tg<id>) кнопки нет.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const st = { lang: "ru", walletAddress: null as string | null };
vi.mock("@/lib/store", () => ({
  useAppStore: <T,>(pick: (s: typeof st) => T) => pick(st),
}));
vi.mock("./NftInputModal", () => ({ NftInputModal: () => null }));
vi.mock("./pack-nft-input-action.css", () => ({}));

const { PackNftInputAction } = await import("./PackNftInputAction");
const html = () => renderToStaticMarkup(<PackNftInputAction />);

describe("PackNftInputAction", () => {
  it("без кошелька (tg<id>, в т.ч. Google ≥ 2^52) — кнопки нет", () => {
    st.walletAddress = "tg4503599627370497";
    expect(html()).toBe("");
    st.walletAddress = "tg700000002";
    expect(html()).toBe("");
  });

  it("с кошельком — кнопка есть", () => {
    st.walletAddress = "admin2b.example.near";
    expect(html()).toContain("Внести NFT");
  });
});
