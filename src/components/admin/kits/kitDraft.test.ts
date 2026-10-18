// Форма набора ↔ поля для сервера: бокс обязателен, по умолчанию один, пустые
// тираж и лимит — «без», запятая — как точка, строка набора туда и обратно не
// теряет полей.
import { describe, expect, it } from "vitest";
import type { KitAdminRow } from "@/lib/kits";
import { draftOfKit, emptyKitDraft, kitDraftError, kitSavePayload } from "./kitDraft";

const row: KitAdminRow = {
  id: "kit_1",
  boxId: "cp_dragon",
  boxName: "Dragon Pack",
  boxImage: "https://x/box.webp",
  boxCount: 3,
  priceUsd: 24.99,
  prices: { USDT: 24.99, Darai: 58_500_000, STARS: 2115 },
  stock: 100,
  perAccount: null,
  sold: 7,
  active: true,
};

describe("черновик набора", () => {
  it("новый: выключен, один бокс, без бокса и цены — сохранить нельзя", () => {
    const d = emptyKitDraft();
    expect(d).toMatchObject({ active: false, boxCount: "1", box: null });
    expect(kitDraftError(d)).toBe("kits.err_box");
    const withBox = { ...d, box: { id: "cp_dragon", name: "Dragon Pack", image: null } };
    expect(kitDraftError(withBox)).toBe("kits.err_price");
    const filled = { ...withBox, priceUsd: "4,99" };
    expect(kitDraftError(filled)).toBeNull();
    expect(kitSavePayload(filled)).toEqual({
      boxId: "cp_dragon",
      boxCount: 1,
      priceUsd: 4.99,
      stock: null,
      perAccount: null,
      active: false,
    });
  });

  it("туда и обратно — те же поля", () => {
    const d = draftOfKit(row);
    expect(d).toMatchObject({ boxCount: "3", priceUsd: "24.99", stock: "100", perAccount: "" });
    expect(d.box).toEqual({ id: "cp_dragon", name: "Dragon Pack", image: "https://x/box.webp" });
    expect(kitDraftError(d)).toBeNull();
    expect(kitSavePayload(d)).toEqual({
      id: "kit_1",
      boxId: "cp_dragon",
      boxCount: 3,
      priceUsd: 24.99,
      stock: 100,
      perAccount: null,
      active: true,
    });
  });

  it("мусор в полях — ошибка, а не «без тиража» и не ноль", () => {
    expect(kitDraftError({ ...draftOfKit(row), stock: "abc" })).toBe("kits.err_stock");
    expect(kitDraftError({ ...draftOfKit(row), boxCount: "" })).toBe("kits.err_count");
    expect(kitDraftError({ ...draftOfKit(row), priceUsd: "10$" })).toBe("kits.err_price");
  });
});
