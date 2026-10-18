// Журнал сделок: приз мистического бокса — свой товар или ресурс (Bonus Box
// подписки и любые другие боксы). Это не добыча (владелец, 06.10.2026): в
// турнире «Золото» продажа такого товара прибыли не даёт. Строка — «купил» за
// 'box' без цены: goldProfitFlow относит её к полученному без прибыли.
//
// Ключ товара — тот же, что у маркета, склада и ратуши (canon-key): иначе
// продажа приза не увидит этой строки. Ключ повтора — ref приза «mystic:<грант>»
// (тот же, что у выдачи): повтор выдачи строку не задвоит. Best-effort, как
// весь журнал: ничего не бросает, выдачу не ломает.
import { accountOf } from "@/server/api/user-shared";
import { goodKey } from "@/server/api/beta-raid/admin-economy-keys";
import { noteTrade } from "@/server/api/beta-raid/econ/trade-journal";
import { marketTradeKey } from "@/server/api/beta-raid/econ/canon-key";

/** Ключ приза: свой товар — по имени канона шаблона, ресурс — resource:<код>. */
export async function boxPrizeKey(
  kind: "custom" | "resource",
  code: string,
  name: string | null | undefined,
): Promise<string> {
  if (kind === "resource") return goodKey("resource", code, code) ?? `resource:${code}`;
  return marketTradeKey({
    id: code,
    kind: "custom",
    refId: code,
    name: name || code,
    giveToken: null,
  });
}

/** Приз бокса выдан: «купил» за 'box', цена 0. */
export async function noteBoxPrize(o: {
  wallet: string;
  kind: "custom" | "resource";
  code: string;
  amount: number;
  name?: string | null;
  /** Ключ выдачи: «mystic:<грант>». */
  ref: string;
}): Promise<void> {
  try {
    if (!(o.amount > 0)) return;
    const account = await accountOf(o.wallet);
    await noteTrade({
      accountId: account,
      counterparty: null,
      source: "mystic",
      side: "buy",
      itemKey: await boxPrizeKey(o.kind, o.code, o.name),
      itemName: o.name || o.code,
      qty: o.amount,
      priceUnit: 0,
      priceCur: "box",
      total: 0,
      ref: o.ref,
    });
  } catch (e) {
    console.warn("trade-journal", "mystic", e instanceof Error ? e.message : String(e));
  }
}
