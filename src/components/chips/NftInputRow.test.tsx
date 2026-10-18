// Количество в строке «ввести NFT» вписывается цифрами (жалоба 29.09): поле с
// цифровой клавиатурой вместо немой цифры между «−» и «+».
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/i18n", () => ({ useT: () => (k: string) => k }));

const { NftInputRow } = await import("./NftInputRow");

const tokens = Array.from({ length: 112 }, (_, i) => ({ tokenId: String(i) }));
const group = {
  key: "g",
  sample: { imageUrl: null },
  mainTitle: "Universe Pack",
  subtitle: "pack",
  tokens,
  keys: tokens.map((x) => x.tokenId),
} as unknown as Parameters<typeof NftInputRow>[0]["group"];

describe("NftInputRow — количество цифрами", () => {
  it("поле ввода с цифровой клавиатурой и текущим числом", () => {
    const out = renderToStaticMarkup(
      <NftInputRow
        group={group}
        qty={112}
        selected={false}
        busy={false}
        onToggle={() => {}}
        onQty={() => {}}
        onDeposit={() => {}}
      />,
    );
    expect(out).toContain('inputMode="numeric"');
    expect(out).toContain('value="112"');
  });
});
