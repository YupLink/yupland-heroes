// «Взять в рюкзак» (владелец, 28.10.2026: «шамана можно поставить в охрану
// шахты»): шаман из хижины уходит в рюкзак ВЫБРАННОГО героя боссом своего
// шаблона — стопка boss:rbt_shaman, вид boss. Дальше его ставит в охрану
// прежний путь placeMineGuard (mine-guard.ts) без изменений: урон и способности
// снимаются с шаблона при установке.
//
// Можно, только когда админ назначил шаману HP и урон (иначе шаман — только для
// обряда погоды) и герой стоит у замка — как перекладывание со склада замка.
// Шаги: место в рюкзаке → забрать шамана (свой ключ) → положить (свой ключ);
// не легло — шаман возвращается в хижину, только если выдачу заперли мы
// (shaman-stock.ts), иначе он уже в рюкзаке и вернуть его значило бы задвоить.
import { createServerFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { sqlStr } from "@/server/api/raid-shared";
import { homeCastleStatus } from "@/server/api/beta-raid/home-castle";
import {
  assertBackpackRoom,
  depositToBackpack,
  resolveBackpack,
  stackKeyFor,
} from "@/server/api/beta-raid/market-backpack";
import { hutPlayer, requireShamanHut } from "./shaman-own";
import { refundShamanSql, takeShamanSql } from "./shaman-stock";
import { loadShamanTemplate } from "./shaman-template";

export const takeShamanToBackpack = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true; count: number }> => {
    const { wallet, account } = await hutPlayer();
    await requireShamanHut(account);
    const tpl = await loadShamanTemplate();
    if (!tpl?.guard) throw new Error("shaman.no_stats");
    if (!(await homeCastleStatus(wallet)).here) throw new Error("shaman.at_castle");
    const bp = await resolveBackpack(wallet);
    if (!bp) throw new Error("market.need_hero");

    const item = {
      kind: "boss" as const,
      refId: tpl.id,
      id: `boss:${tpl.id}`,
      name: tpl.name,
      image: tpl.image,
    };
    // Место — до забора: полный рюкзак не трогает хижину вовсе.
    await assertBackpackRoom(bp, await stackKeyFor(item), 1);

    const nonce = `shaman:${nanoid(12)}`;
    const took = sqlRow<{ took: boolean; remain: number | string }>(
      (await mcpExec(takeShamanSql(account, `${nonce}:take`))) as unknown[],
    );
    // Ответ моста не разобран, а забор мог пройти — смотрим ключ забора: он есть — шаман взят.
    if (typeof took?.took !== "boolean") {
      const seen = sqlRow<{ was: boolean }>(
        (await mcpExec(
          `SELECT row_to_json(_t.*) AS _row FROM (SELECT EXISTS (SELECT 1 FROM yuplink.raid_backpack_op
             WHERE op = ${sqlStr(`${nonce}:take`)}) AS was) _t;`,
        )) as unknown[],
      );
      if (!seen?.was) throw new Error("shaman.none");
    } else if (!took.took) throw new Error("shaman.none");
    const count = Math.max(0, Number(took?.remain) || 0);

    try {
      await depositToBackpack({
        heroId: bp.heroId,
        account,
        item,
        qty: 1,
        nonce,
        capacity: bp.capacity,
        potionCapacity: bp.potionCapacity,
      });
    } catch (e) {
      // Ключ выдачи — `bp:<nonce>` (depositToBackpack). Заперли мы — шаман назад.
      const back = sqlRow<{ refunded: boolean }>(
        (await mcpExec(refundShamanSql(account, `bp:${nonce}`, `${nonce}:back`))) as unknown[],
      );
      if (back?.refunded === false) return { ok: true as const, count };
      throw e;
    }
    return { ok: true as const, count };
  },
);
