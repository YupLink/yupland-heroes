import { describe, expect, it } from "vitest";
import { entryScreen } from "./screenReadiness";

const ok = (wallet: string | null) => ({ data: { wallet }, isError: false });

describe("entryScreen — вход без кошелька (17.10)", () => {
  it("гость без входа — экран входа через Telegram, а не старая страница с кошельком", () => {
    expect(entryScreen(true, false, ok(null))).toBe("guest");
  });
  it("пока идёт вход по Telegram — заставка, даже со старой кукой (общее устройство)", () => {
    expect(entryScreen(true, false, ok(null), true)).toBe("loading");
    expect(entryScreen(true, false, ok("tg1"), true)).toBe("loading");
  });
  it("аккаунт Telegram без кошелька (tg<id>) играет в замке", () => {
    expect(entryScreen(true, false, ok("tg5270301127"))).toBe("castle");
  });
  it("старая страница — только вошедшему и только по его выбору", () => {
    expect(entryScreen(true, true, ok("tg1"))).toBe("classic");
    expect(entryScreen(true, true, ok(null))).toBe("guest");
  });
  it("нет ответа сессии — загрузка или ошибка", () => {
    expect(entryScreen(false, false, ok(null))).toBe("loading");
    expect(entryScreen(true, false, { isError: true })).toBe("error");
    expect(entryScreen(true, false, { isError: false })).toBe("loading");
  });
});
