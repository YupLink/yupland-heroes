// Профиль: новый код → карточка; нет среди новых → код на лайки той же
// карточкой; русские отказы старой ручки → ключи словаря.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  promo: null as unknown,
  likes: null as unknown,
  likesFail: null as string | null,
  calls: [] as string[],
}));

vi.mock("@/server/api/promo/promo-redeem", () => ({
  redeemPromo: async ({ data }: { data: { code: string; opId: string } }) => {
    s.calls.push(`promo:${data.code}:${/^[0-9a-f]{24}$/.test(data.opId)}`);
    return s.promo;
  },
}));
vi.mock("@/server/api/likes", () => ({
  redeemLikePromocode: async ({ data }: { data: { code: string } }) => {
    s.calls.push(`likes:${data.code}`);
    if (s.likesFail) throw new Error(s.likesFail);
    return s.likes;
  },
}));

const { redeemAnyPromo } = await import("./usePromoRedeem");
const { likesError, likesOutcome, promoAmountText, promoItemImage, promoItemName, promoToastOf } =
  await import("./promoView");

beforeEach(() => {
  Object.assign(s, { promo: null, likes: null, likesFail: null });
  s.calls.length = 0;
});

describe("ввод в профиле", () => {
  it("новый код — его карточка, к лайкам не ходим", async () => {
    const items = [
      { kind: "resource", ref: "gold", name: null, image: null, amount: 5, where: "balance" },
    ];
    s.promo = { status: "ok", code: "AUTUMN", items };
    await expect(redeemAnyPromo("autumn")).resolves.toEqual({ code: "AUTUMN", items });
    expect(s.calls).toEqual(["promo:autumn:true"]);
  });

  it("нет среди новых — код на лайки, та же карточка", async () => {
    s.promo = { status: "not_found" };
    s.likes = { ok: true, likesAdded: 30, newLikeBalance: 40, code: "OLD" };
    await expect(redeemAnyPromo("old")).resolves.toEqual({
      code: "OLD",
      items: [{ kind: "likes", ref: null, name: null, image: null, amount: 30, where: "balance" }],
    });
    expect(s.calls).toEqual(["promo:old:true", "likes:old"]);
  });

  it("отказ старой ручки — ключом словаря", async () => {
    s.promo = { status: "not_found" };
    s.likesFail = "Промокод не найден";
    await expect(redeemAnyPromo("nope")).rejects.toThrow("promo.err_not_found");
    expect(likesError(new Error("Лимит активаций исчерпан")).message).toBe("promo.err_exhausted");
    expect(likesError(new Error("Этот промокод уже активирован с этого кошелька")).message).toBe(
      "promo.err_used",
    );
    expect(likesError(new Error("что-то иное")).message).toBe("что-то иное");
    expect(likesOutcome({ likesAdded: 0, code: "Z" }).items).toEqual([]);
  });
});

describe("показ строки", () => {
  const t = (k: string) => `[${k}]`;
  const it0 = { ref: null, name: null, image: null, amount: 1250, where: "balance" as const };

  it("имя: из пикера, иначе ресурс/DARAI/вид по словарю", () => {
    expect(promoItemName({ ...it0, kind: "resource", ref: "wood" }, t)).toBe("[braid.rw_wood]");
    expect(promoItemName({ ...it0, kind: "token", ref: "Darai" }, t)).toBe("DARAI");
    expect(promoItemName({ ...it0, kind: "energy" }, t)).toBe("[gifts.kind.energy]");
    expect(promoItemName({ ...it0, kind: "custom", name: "Пшеница" }, t)).toBe("Пшеница");
  });

  it("картинка и «+мера» / «×штуки»", () => {
    expect(promoItemImage({ ...it0, kind: "likes" })).toBe("/resources/likes.webp");
    expect(promoItemImage({ ...it0, kind: "token", ref: "Darai" })).toBe("/resources/darai.webp");
    expect(promoItemImage({ ...it0, kind: "pack" })).toBeNull();
    expect(promoAmountText({ ...it0, kind: "resource" }, "en")).toBe("+1,250");
    expect(promoAmountText({ ...it0, kind: "pack", amount: 3 }, "ru")).toBe("×3");
  });
});

describe("тост после ввода", () => {
  const got = (where: string) => ({
    kind: "resource" as const,
    ref: "gold",
    name: null,
    image: null,
    amount: 1,
    where: where as "balance" | "pending",
  });

  it("ничего не выпало / что-то не доехало / всё на месте — разные тосты", () => {
    expect(promoToastOf({ code: "X", items: [] })).toBe("nothing");
    expect(promoToastOf({ code: "X", items: [got("balance"), got("pending")] })).toBe("pending");
    expect(promoToastOf({ code: "X", items: [got("pending")] })).toBe("pending");
    expect(promoToastOf({ code: "X", items: [got("balance")] })).toBe("got");
  });
});
