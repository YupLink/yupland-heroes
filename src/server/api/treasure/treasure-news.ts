// Клад в API газеты (владелец 07.11.2026: «в газету попадать должен только скрин —
// никакой инфы, где клад и кто нашёл»). /api/news?format=json → `treasure`:
// { image } — ссылка на скрин живого клада (image=treasure&id=…, тем же ключом
// API); клада нет — null. Ни мира, ни приза, ни статуса, ни нашедшего.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { WEBAPP_URL } from "@/server/tg";

export type NewsTreasure = { image: string };

/** Скрин живого клада или null. */
export async function latestTreasure(): Promise<NewsTreasure | null> {
  const rows = (await mcpExec(
    `SELECT id FROM yuplink.raid_treasure
      WHERE status = 'live' AND expires_at > now() AND shot IS NOT NULL LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ id: string }> | null;
  const id = rows?.[0]?.id;
  return id
    ? { image: `${WEBAPP_URL}/api/news?image=treasure&id=${encodeURIComponent(id)}` }
    : null;
}

/** Скрин клада (JPEG) или null. */
export async function treasureShot(id: string): Promise<Buffer | null> {
  if (!/^trs_[A-Za-z0-9_-]{6,40}$/.test(id)) return null;
  const rows = (await mcpExec(
    `SELECT shot FROM yuplink.raid_treasure WHERE id = ${sqlStr(id)} AND shot IS NOT NULL;`,
    { wrapJson: true },
  )) as Array<{ shot: string }> | null;
  const shot = rows?.[0]?.shot;
  return shot ? Buffer.from(shot, "base64") : null;
}
