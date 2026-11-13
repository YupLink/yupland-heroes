// Закопать клад слота дня (lib/treasure): приз — первая неиспользованная строка
// фонда (не нашли вчерашний — это он же: из фонда приз уходит только при находке),
// клетка — treasure-pick, скрин — treasure-shot, админам — фото с миром,
// координатами и призом. Слот — один клад (unique slot): два процесса разом
// второго не закопают. Живёт до следующего слота (сутки при закапывании в 09:00 МСК);
// фонд пополнили поздно или сервер лежал — закопается сразу, если до следующих
// 09:00 МСК больше MIN_LEFT_HOURS, иначе — в ближайшие 09:00. Админ может
// закопать сам (buryNow) — такой клад живёт сутки от запуска.
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { TREASURE_LIFE_HOURS, treasureSlot } from "@/lib/treasure";
import type { MarketPriceResource } from "@/lib/marketItem";
import { secureRandom } from "@/lib/secureRandom";
import { pickTreasureSpot, type TreasureSpot } from "./treasure-pick";
import { loadShotCells } from "./treasure-shot-data";
import { SHOT_RADIUS, centerCell, frameCenter, renderTreasureShot } from "./treasure-shot";
import { alertOnce, esc, placedCaption, sendAdminsPhoto } from "./treasure-tg";

/** Меньше — «на огрызок» суток клад не закапываем, ждём следующего слота. */
export const MIN_LEFT_HOURS = 6;

type FundRow = {
  id: string;
  resource: MarketPriceResource;
  token: string | null;
  amount: number;
  name: string | null;
  image: string | null;
};

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

async function rows(sql: string): Promise<Array<Record<string, unknown>>> {
  return ((await mcpExec(sql, { wrapJson: true })) ?? []) as Array<Record<string, unknown>>;
}

async function nextPrize(): Promise<FundRow | null> {
  const x = (
    await rows(`SELECT id, resource, token, amount, name, image FROM yuplink.raid_treasure_fund
                 WHERE used_at IS NULL ORDER BY created_at, id LIMIT 1;`)
  )[0];
  if (!x) return null;
  return {
    id: String(x.id),
    resource: String(x.resource) as MarketPriceResource,
    token: str(x.token),
    amount: Number(x.amount),
    name: str(x.name),
    image: str(x.image),
  };
}

/** Фото админам — один раз; не дошло ни до кого — следующий обход повторит. */
export async function notifyPlaced(id: string): Promise<void> {
  const x = (
    await rows(`SELECT t.id, t.q, t.r, t.resource, t.token, t.amount, t.name, t.shot,
                       extract(epoch FROM t.expires_at) * 1000 AS exp,
                       COALESCE(NULLIF(m.name, ''), t.map_id) AS world
                  FROM yuplink.raid_treasure t LEFT JOIN yuplink.raid_maps m ON m.id = t.map_id
                 WHERE t.id = ${sqlStr(id)} AND t.notified_at IS NULL AND t.shot IS NOT NULL;`)
  )[0];
  if (!x) return;
  // Отметка со своим ключом вызова: слепой повтор запроса узнаёт её своей.
  const me = sqlStr(nanoid(12));
  const claimed = (await mcpExec(
    `UPDATE yuplink.raid_treasure SET notified_at = now(), notify_op = ${me}
      WHERE id = ${sqlStr(id)} AND (notified_at IS NULL OR notify_op = ${me}) RETURNING id`,
    { wrapJsonCte: true },
  )) as unknown[];
  if (!Array.isArray(claimed) || claimed.length === 0) return;
  const caption = placedCaption({
    world: String(x.world),
    q: Number(x.q),
    r: Number(x.r),
    resource: String(x.resource) as MarketPriceResource,
    token: str(x.token),
    amount: Number(x.amount),
    name: str(x.name),
    image: null,
    expiresAt: Number(x.exp),
  });
  const sent = await sendAdminsPhoto(Buffer.from(String(x.shot), "base64"), caption);
  if (sent === 0) {
    await mcpExec(`UPDATE yuplink.raid_treasure SET notified_at = NULL WHERE id = ${sqlStr(id)};`);
  }
}

/** Клетка и скрин; сбой — сигнал админам раз за слот и бросок (обход повторит). */
async function spotAndShot(day: string): Promise<{ spot: TreasureSpot; jpeg: Buffer } | null> {
  try {
    const spot = await pickTreasureSpot(secureRandom);
    if (!spot) {
      await alertOnce("spot", day, "⚠️ Клад: не нашлось клетки ни в одном мире.");
      return null;
    }
    const center = frameCenter(spot.q, spot.r, secureRandom);
    const cc = centerCell(center);
    const cells = await loadShotCells(spot.mapId, cc.q, cc.r, SHOT_RADIUS);
    return { spot, jpeg: await renderTreasureShot(cells, center) };
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await alertOnce("render", day, `⚠️ Клад не закопан: ${esc(msg)}. Пробую снова.`);
    throw e;
  }
}

/** Закопать: приз из фонда, клетка, скрин, строка, фото админам. Ответ — id или null. */
async function bury(o: {
  day: string;
  expiresMs: number;
  manual: boolean;
}): Promise<string | null> {
  const prize = await nextPrize();
  if (!prize) {
    if (o.manual) throw new Error("treasure.fund_empty_err");
    await alertOnce("empty", o.day, "⚠️ Фонд клада пуст — сегодня клад не закопан.");
    return null;
  }
  const got = await spotAndShot(o.day);
  if (!got) return null;
  const { spot, jpeg } = got;
  const id = `trs_${nanoid(12)}`;
  const opt = (v: string | null) => (v ? sqlStr(v) : "NULL");
  // Слепой повтор вставки видит свою строку занятой — судим по id, а не по RETURNING.
  await mcpExec(
    `INSERT INTO yuplink.raid_treasure
       (id, fund_id, slot, manual, map_id, q, r, resource, token, amount, name, image, expires_at, shot)
     VALUES (${sqlStr(id)}, ${sqlStr(prize.id)}, ${sqlStr(o.day)}::date, ${o.manual},
             ${sqlStr(spot.mapId)}, ${spot.q}, ${spot.r}, ${sqlStr(prize.resource)}, ${opt(prize.token)},
             ${prize.amount}, ${opt(prize.name)}, ${opt(prize.image)}, to_timestamp(${o.expiresMs / 1000}),
             ${sqlStr(jpeg.toString("base64"))})
     ON CONFLICT DO NOTHING;`,
  );
  const mine = await rows(`SELECT 1 AS x FROM yuplink.raid_treasure WHERE id = ${sqlStr(id)};`);
  if (mine.length === 0) return null;
  await notifyPlaced(id);
  return id;
}

const liveNow = async () =>
  (await rows(`SELECT 1 AS x FROM yuplink.raid_treasure WHERE status = 'live' LIMIT 1;`)).length >
  0;

/** Пора — закопать клад этого слота (09:00 МСК). Ответ — id закопанного или null. */
export async function placeIfDue(now: number = Date.now()): Promise<string | null> {
  const slot = treasureSlot(now);
  const expiresMs = slot.startMs + TREASURE_LIFE_HOURS * 3600_000;
  if (expiresMs - now < MIN_LEFT_HOURS * 3600_000) return null;
  // Клад этого слота уже был (в т. ч. запущенный админом сегодня) или лежит живой — ждём.
  const busy = await rows(
    `SELECT 1 AS x FROM yuplink.raid_treasure
      WHERE slot = ${sqlStr(slot.day)}::date OR status = 'live' LIMIT 1;`,
  );
  if (busy.length > 0) return null;
  return bury({ day: slot.day, expiresMs, manual: false });
}

/**
 * Админ закапывает сам (владелец 07.11.2026: «админ может сам запустить, если что —
 * живёт сутки»): сейчас, на сутки от запуска. Живой клад уже лежит — отказ.
 */
export async function buryNow(now: number = Date.now()): Promise<string> {
  if (await liveNow()) throw new Error("treasure.live_exists");
  const id = await bury({
    day: treasureSlot(now).day,
    expiresMs: now + TREASURE_LIFE_HOURS * 3600_000,
    manual: true,
  });
  if (!id) throw new Error((await liveNow()) ? "treasure.live_exists" : "treasure.no_spot");
  return id;
}
