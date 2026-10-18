// Разбор поломанного корабля на доски.
//
// «Разбитое судно (жизни кончились) стоит у берега мёртвым артом, пока его
// не залатают» (ship-repair.ts). Теперь его альтернативно можно разобрать
// на доски: 1 плата энергии = 1 доска (small), 2 доски (big).
//
// Тарифы (спека владельца 14.09):
//   • small = 1 доска
//   • big   = 2 доски
//   • стоит 1 энергию базово
//   • разобрать может кто угодно, не обязательно владелец коша: разбитое
//     судно ничьё, как гриб под ковром.
//
// Условие: hp = 0 (полностью разбито) И на борту никого. Иначе — сначала
// добей ремонтом, а не разбирай пригодную для починки посудину.
//
// «Никого на борту» — обязательно: по спеке (shipHealth.ts) ноль не запирает
// капитана, судно с экипажем плывёт и в минус. Раньше разбор смотрел только на
// hp, и такой борт мог разобрать любой сосед — и сам капитан из своего окна,
// где «Починить» и «Разобрать» стоят рядом: «починил корабль — и он испарился»
// (20.09, бурст разборов 15:35Z; на проде двое плыли с hp −4187 и −382).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId, ownCell } from "./encounter-where";
import { areNeighbors } from "./helpers";
import { resolveBackpack } from "./market-backpack";
import { depositToBackpack } from "./market-backpack-write";
import { payForHit } from "./encounter-pay";
import { publishRaid } from "../../raidLive";
// Вид доски (имя, картинка, шаблон) — из одного места с починкой: три формы
// стека «Доска» на проде выросли из того, что разборка собирала его сама.
import { plankItem } from "./plank-item";

const SCRAP_COST = 1; // энергия
const PLANK_YIELD: Record<"small" | "big", number> = { small: 1, big: 2 };

type ShipRow = { id: string; kind: "small" | "big"; hp: number; owner: string };

async function scrappableShipAt(
  mapId: string,
  q: number,
  r: number,
  shipId?: string | null,
): Promise<ShipRow | null> {
  const rows = (await mcpExec(
    `SELECT id, COALESCE(kind, 'small') AS kind, hp, owner
       FROM yuplink.beta_raid_ship
      WHERE map_id = ${sqlStr(mapId)} AND q = ${q} AND r = ${r}
        AND hp <= 0 AND crew_account IS NULL
        ${shipId ? `AND id = ${sqlStr(shipId)}` : ""}
      ORDER BY hp, created_at LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ id: string; kind: string; hp: number; owner: string }>;
  const row = rows?.[0];
  return row
    ? {
        id: row.id,
        kind: row.kind === "big" ? "big" : "small",
        hp: Number(row.hp),
        owner: String(row.owner ?? ""),
      }
    : null;
}

export const getShipScrap = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ q: z.number().int(), r: z.number().int(), shipId: z.string().nullish() }).parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    const ship = await scrappableShipAt(mapId, data.q, data.r, data.shipId ?? null);
    if (!ship) return null;
    return {
      shipKind: ship.kind,
      planks: PLANK_YIELD[ship.kind],
      cost: SCRAP_COST,
    };
  });

export const scrapShip = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ q: z.number().int(), r: z.number().int(), shipId: z.string().nullish() }).parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    const [pos, ship, bp] = await Promise.all([
      ownCell(wallet),
      scrappableShipAt(mapId, data.q, data.r, data.shipId ?? null),
      resolveBackpack(wallet).catch(() => null),
    ]);
    if (!pos) throw new Error("Ты ещё не на карте");
    const near =
      (pos.q === data.q && pos.r === data.r) || areNeighbors(pos.q, pos.r, data.q, data.r);
    if (!near) throw new Error("braid.ship_scrap_far");
    if (!ship) throw new Error("braid.ship_scrap_none");
    if (!bp?.heroId) throw new Error("Сначала выбери героя");

    const planks = PLANK_YIELD[ship.kind];

    // 1) Списание судна атомарно: если кто-то параллельно уже разобрал/
    //    починил/сел на борт, наша операция вернёт 0 строк — не будем выдавать
    //    доски. Экипаж проверяем и здесь, а не только в выборке выше: между
    //    чтением и DELETE капитан мог успеть сесть.
    const gone = (await mcpExec(
      `DELETE FROM yuplink.beta_raid_ship
        WHERE id = ${sqlStr(ship.id)} AND hp <= 0 AND crew_account IS NULL
        RETURNING id;`,
      { wrapJsonCte: true },
    )) as Array<{ id: string }>;
    if (!gone?.length) throw new Error("braid.ship_scrap_none");

    // 2) Плата энергии — после атомарного снятия судна: если бы платили
    //    раньше, при гонке двух разбирающих один платил бы за чужой разбор.
    //    Не удалось оплатить — восстанавливаем судно INSERT'ом назад с hp=0.
    let pay: { refund: () => Promise<void> };
    try {
      pay = await payForHit(wallet, SCRAP_COST, "ship");
    } catch (e) {
      // Восстанавливаем судно: BUY-back — простой INSERT назад, hp=0. `owner`
      // в таблице NOT NULL: без него откат молча падал, и судно пропадало.
      await mcpExec(
        `INSERT INTO yuplink.beta_raid_ship (id, map_id, q, r, owner, kind, hp, created_at)
         VALUES (${sqlStr(ship.id)}, ${sqlStr(mapId)}, ${data.q}, ${data.r},
                 ${sqlStr(ship.owner)}, ${sqlStr(ship.kind)}, 0, now())
         ON CONFLICT (id) DO NOTHING;`,
      ).catch(() => {});
      throw e;
    }

    // 3) Доски в рюкзак героя. Если депозит упал — возвращаем судно и
    //    возвращаем энергию: в потере доски или судна виноваты не мы.
    const { accAccountId } = await import("../currency/move");
    const account = (await accAccountId(wallet).catch(() => null)) ?? wallet;
    try {
      await depositToBackpack({
        heroId: bp.heroId,
        account,
        item: await plankItem(),
        qty: planks,
        nonce: `ship-scrap:${ship.id}:${nanoid(10)}`,
        capacity: bp.capacity,
        potionCapacity: bp.potionCapacity,
      });
    } catch (e) {
      await Promise.all([
        pay.refund(),
        mcpExec(
          `INSERT INTO yuplink.beta_raid_ship (id, map_id, q, r, owner, kind, hp, created_at)
           VALUES (${sqlStr(ship.id)}, ${sqlStr(mapId)}, ${data.q}, ${data.r},
                   ${sqlStr(ship.owner)}, ${sqlStr(ship.kind)}, 0, now())
           ON CONFLICT (id) DO NOTHING;`,
        ).catch(() => {}),
      ]);
      throw e;
    }

    publishRaid({ mapId, type: "ships" });
    return {
      ok: true as const,
      planks,
      shipKind: ship.kind,
      spent: SCRAP_COST,
    };
  });
