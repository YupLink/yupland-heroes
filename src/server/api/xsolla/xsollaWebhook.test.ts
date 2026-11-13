// Вебхук Xsolla (§8.127): подпись, проверка игрока, выдача оплаченного один раз,
// тестовый заказ — только тестовому аккаунту, отмена, чужой проект.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { xsollaSignature, xsollaSignatureOk } from "./xsollaSign";
import { cardKind, payStationUrl, safeReturnPath } from "@/lib/xsollaCatalog";

const st = vi.hoisted(() => ({
  sql: [] as string[],
  accounts: new Set(["acc_buyer01", "acc_tester1"]),
  tests: ["acc_tester1"],
  granted: [] as string[],
  canceled: [] as number[],
}));

vi.stubEnv("XSOLLA_PROJECT_ID", "320195");
vi.stubEnv("XSOLLA_API_KEY", "k");
vi.stubEnv("XSOLLA_WEBHOOK_SECRET", "s3cret");
vi.stubEnv("XSOLLA_SANDBOX", "1");

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    st.sql.push(sql);
    const acc = /id = '(acc_[^']+)'/.exec(sql)?.[1];
    if (/FROM yuplink\.accounts WHERE id/.test(sql))
      return acc && st.accounts.has(acc) ? [{ id: acc }] : [];
    if (/xsolla_test_accounts/.test(sql)) return [{ value: JSON.stringify(st.tests) }];
    return [];
  },
}));
vi.mock("./xsollaGrant", () => ({
  grantCardOrder: async (o: { orderId: number; account: string }) => {
    st.granted.push(`${o.orderId}:${o.account}`);
    return { gold: 1, subs: [], unknown: [] };
  },
  cancelCardOrder: async (orderId: number) => void st.canceled.push(orderId),
  orderUpsertSql: (o: { orderId: number }, status: string) => `UPSERT ${o.orderId} ${status}`,
}));
vi.mock("./xsollaNotify", () => ({ notifyCardSale: async () => {} }));

const { handleXsollaWebhook } = await import("./xsollaWebhook");

const send = (body: object, secret = "s3cret") => {
  const raw = JSON.stringify(body);
  return handleXsollaWebhook(raw, `Signature ${xsollaSignature(raw, secret)}`);
};
const paid = (account: string, mode = "default", id = 777) => ({
  notification_type: "order_paid",
  order: { id, mode, amount: "5.00", currency: "USD" },
  user: { external_id: account },
  items: [{ sku: "gold_1k", quantity: 1 }],
  billing: { settings: { project_id: 320195 } },
});

beforeEach(() => {
  st.sql = [];
  st.granted = [];
  st.canceled = [];
});

describe("подпись", () => {
  it("sha1(тело + секрет); чужой секрет и пустой заголовок — нет", () => {
    const sig = xsollaSignature('{"a":1}', "s");
    expect(xsollaSignatureOk('{"a":1}', `Signature ${sig}`, "s")).toBe(true);
    expect(xsollaSignatureOk('{"a":1}', `Signature ${sig}`, "x")).toBe(false);
    expect(xsollaSignatureOk('{"a":1}', null, "s")).toBe(false);
  });
  it("вебхук с неверной подписью — 400 INVALID_SIGNATURE, в базу ни шагу", async () => {
    const r = await send(paid("acc_buyer01"), "wrong");
    expect(r).toMatchObject({ status: 400, body: { error: { code: "INVALID_SIGNATURE" } } });
    expect(st.sql).toEqual([]);
  });
});

describe("события", () => {
  it("user_validation: свой аккаунт — 204, чужой — INVALID_USER", async () => {
    expect(
      await send({ notification_type: "user_validation", user: { id: "acc_buyer01" } }),
    ).toEqual({ status: 204 });
    expect(
      await send({ notification_type: "user_validation", user: { id: "acc_nobody1" } }),
    ).toMatchObject({
      status: 400,
      body: { error: { code: "INVALID_USER" } },
    });
  });
  it("order_paid (живой) — выдаёт; тестовый — только тестовому аккаунту", async () => {
    expect(await send(paid("acc_buyer01"))).toEqual({ status: 204 });
    expect(st.granted).toEqual(["777:acc_buyer01"]);
    expect(await send(paid("acc_buyer01", "sandbox", 778))).toEqual({ status: 204 });
    expect(st.granted).toHaveLength(1);
    expect(st.sql.some((q) => q === "UPSERT 778 ignored")).toBe(true);
    expect(await send(paid("acc_tester1", "sandbox", 779))).toEqual({ status: 204 });
    expect(st.granted).toEqual(["777:acc_buyer01", "779:acc_tester1"]);
  });
  it("order_canceled — возврат; чужой проект — отказ", async () => {
    expect(await send({ ...paid("acc_buyer01"), notification_type: "order_canceled" })).toEqual({
      status: 204,
    });
    expect(st.canceled).toEqual([777]);
    const other = { ...paid("acc_buyer01"), billing: { settings: { project_id: 1 } } };
    expect((await send(other)).status).toBe(400);
  });
});

describe("товары", () => {
  it("картой — золото §8.66 и подписки; энергия и чужое — нет", () => {
    expect(cardKind("gold_150k")).toBe("gold");
    expect(cardKind("esub_ultra")).toBe("sub");
    expect(cardKind("enp_1tyJ2rsL")).toBeNull();
    expect(cardKind("gold_999")).toBeNull();
  });
  it("окно оплаты и адрес возврата", () => {
    expect(payStationUrl("t", true)).toBe("https://sandbox-secure.xsolla.com/paystation4/?token=t");
    expect(payStationUrl("t", false)).toBe("https://secure.xsolla.com/paystation4/?token=t");
    expect(safeReturnPath("/chips")).toBe("/chips");
    expect(safeReturnPath("//evil.com")).toBe("/");
    expect(safeReturnPath("https://evil.com")).toBe("/");
  });
});
