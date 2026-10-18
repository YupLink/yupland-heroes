// Витрина наборов в окне «Купить энергию»: включённые наборы — бокс, сколько
// штук, цены в USDT / DARAI / Stars по курсу (как у тарифа подписки), сколько
// ещё осталось и сколько уже купил я. Выключенных игрок не видит.
//
// «Купил я» — живые брони и покупки аккаунта (снятые не в счёт): ровно то,
// что считает лимит в kit_reserve, иначе кнопка спорила бы с отказом.
//
// Имя функции новое (была getKitOffers с другой формой ответа): клиент старой
// сборки получит отказ и просто не покажет секцию, а не упадёт на новой форме.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { getCurrentWallet, isAdminWallet } from "../../auth";
import { KITS_ADMIN_ONLY } from "@/lib/featureGates";
import { daraiPerUsd } from "../energy-sub/rate";
import type { KitOffer } from "@/lib/kits";
import { kitSelect, toOffer, type KitRow } from "./kit-rows";

export const getKitShop = createServerFn({ method: "GET" }).handler(
  async (): Promise<KitOffer[]> => {
    // Часы самопочинки броней — лениво, с первого открытия витрины в процессе.
    void import("./kit-heal").then((m) => m.startKitHealer());
    const wallet = getCurrentWallet();
    // Пока витрина только админам (featureGates): игрок наборов не видит.
    if (KITS_ADMIN_ONLY && !isAdminWallet(wallet)) return [];
    const { accountIdOf } = await import("../user-shared");
    const account = wallet ? await accountIdOf(wallet).catch(() => null) : null;
    const mine = account
      ? `(SELECT count(*) FROM yuplink.kit_order o
           WHERE o.kit_id = k.id AND o.account_id = ${sqlStr(account)}
             AND o.status <> 'released')`
      : "0";
    const rows = ((await mcpExec(
      `${kitSelect(`, ${mine}::int AS mine`)}
        WHERE k.active ORDER BY k.sort, k.created_at;`,
      { wrapJson: true },
    )) ?? []) as KitRow[];
    if (rows.length === 0) return [];
    const rate = (await daraiPerUsd())?.rate ?? null;
    return rows.map((r) => toOffer(r, rate));
  },
);
