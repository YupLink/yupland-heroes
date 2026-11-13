// «Только Google» за золото и подписки со счёта не платит — только картой (13.11.2026).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_TG_BASE, WALLET_TG_BASE } from "@/lib/auth/googleTg";

const st = vi.hoisted(() => ({ tg: null as number | null }));
vi.mock("../../auth", () => ({ getSessionTgId: () => st.tg }));

import { assertNotCardOnly } from "./cardOnly";

beforeEach(() => {
  st.tg = null;
});

describe("оплата со счёта у «только Google»", () => {
  it("Google — USDT и звёзды: отказ card.only; DARAI — можно", () => {
    st.tg = GOOGLE_TG_BASE + 5;
    expect(() => assertNotCardOnly("USDT")).toThrow("card.only");
    expect(() => assertNotCardOnly("STARS")).toThrow("card.only");
    expect(() => assertNotCardOnly("Darai")).not.toThrow();
  });

  it("Telegram, вход кошельком и без сессии — как раньше", () => {
    for (const tg of [700001, WALLET_TG_BASE + 2, null]) {
      st.tg = tg;
      expect(() => assertNotCardOnly("USDT")).not.toThrow();
    }
  });
});
