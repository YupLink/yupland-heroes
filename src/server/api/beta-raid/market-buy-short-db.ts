// Чтение для market-buy-short: сколько у игрока того, чем платят, и имена
// шаблонов предметной цены. Только чтение и только на пути отказа — покупку оно
// не задерживает. Ключ стека рюкзака — тот же канон, что у списания
// (market-money.spend → canonStackKey), иначе «нет» не совпало бы с «не взяли».
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { ShortDeps } from "./market-buy-short";

const RES = new Set(["gold", "stone", "wood", "diamonds"]);

export function shortDeps(wallet: string, account: string): ShortDeps {
  return {
    have: async (l) => {
      if (RES.has(l.resource)) {
        const rows = (await mcpExec(
          `SELECT amount FROM yuplink.account_resources
            WHERE account_id=${sqlStr(account)} AND resource=${sqlStr(l.resource)};`,
          { wrapJson: true },
        )) as Array<{ amount: number | string }>;
        return Math.max(0, Number(rows?.[0]?.amount) || 0);
      }
      if ((l.resource === "boss" || l.resource === "custom") && l.token) {
        const { resolveBackpack } = await import("./market-backpack");
        const { canonStackKey } = await import("./item-alias");
        const { backpackStackCount } = await import("./market-backpack-take");
        const bp = await resolveBackpack(wallet);
        if (!bp) return null;
        return backpackStackCount(bp.heroId, await canonStackKey(l.resource, l.token));
      }
      // Энергия, лайки, токены, артефакты, паки, герои — не гадаем.
      return null;
    },
    itemNames: async (lines) => {
      const { priceMetaBatch, priceMetaOf } = await import("./market-payout-meta");
      const metas = await priceMetaBatch(lines.map((l) => ({ res: l.resource, token: l.token })));
      return lines.map((l) => priceMetaOf(metas, l.resource, l.token)?.name ?? null);
    },
  };
}
