// Готовое задание → шаблон артефакта + один экземпляр создателю, одним
// оператором: шаблон, вещь в инвентаре и отметка «готово» появляются вместе
// или не появляются вовсе. Повтор (мост, двойной тик) упирается в метку
// аренды, status = 'queued' и ON CONFLICT — второй вещи не будет.
//
// meta.crafted = 'ai' — метка «сделано в лаборатории»: случайные выдачи,
// архив картинок и списки админки такие шаблоны пропускают (crafted-sql.ts).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import type { LabJob } from "./lab-sql";

/** Шаблон и экземпляр из id задания: повтор даёт те же ключи. */
export const craftTemplateId = (jobId: string) => `art_ai_${jobId}`;
export const craftItemId = (jobId: string) => `ugi_craft_${jobId}`;

const num = (v: number | null) => (v == null || !Number.isFinite(v) ? "NULL" : String(v));
const txt = (v: string | null) => (v ? sqlStr(v) : "NULL");

export async function finishJob(
  job: LabJob,
  owner: { wallet: string; account: string },
  imageUrl: string,
  made: { seed: number; provider: string },
  token: string,
): Promise<boolean> {
  const tpl = craftTemplateId(job.id);
  const r = job.roll;
  // Генератор игрока (§8.122): «gen» и пока массовый — может выпасть другим
  // (crafted-sql.droppable); лаборатория — «ai», одна вещь на свете.
  const gen = job.kind === "gen";
  const meta = {
    crafted: gen ? "gen" : "ai",
    ...(gen ? { unique: false } : {}),
    craft_id: job.id,
    account: owner.account,
    form: job.form,
    boost: job.boost,
    seed: made.seed,
    provider: made.provider,
  };
  // Сначала «готово» — только своему обработчику (метка аренды) и только из
  // очереди; шаблон и вещь вставляются из этой строки. Задание успели закрыть
  // («не вышло» по сроку, чужая аренда) — ни шаблона, ни вещи не будет:
  // изменяющие WITH в Postgres выполняются всегда, поэтому вставки берут
  // строки из upd, а не стоят сами по себе.
  const out = (await mcpExec(
    `WITH upd AS (
       UPDATE yuplink.artifact_craft
          SET status = 'done', template_id = ${sqlStr(tpl)}, image_url = ${sqlStr(imageUrl)},
              done_at = now(), lease_until = NULL, lease_token = NULL, last_error = NULL
        WHERE id = ${sqlStr(job.id)} AND status = 'queued' AND lease_token = ${sqlStr(token)}
        RETURNING id
     ), tpl AS (
       INSERT INTO yuplink.mystic_item_template
         (id, kind, name, image_url, rarity, meta, active, created_by_wallet, slot,
          stat_type, stat_amount, race, race_amount, specialization, spec_amount, land, land_amount)
       SELECT ${sqlStr(tpl)}, 'artifact', ${sqlStr(job.name)}, ${sqlStr(imageUrl)},
          ${sqlStr(job.rarity)}, ${sqlStr(JSON.stringify(meta))}::jsonb, true,
          ${sqlStr(owner.wallet)}, ${sqlStr(job.slot)}, ${sqlStr(r.statType)}, ${num(r.statAmount)},
          ${txt(r.race)}, ${num(r.raceAmount)}, ${txt(r.spec)}, ${num(r.specAmount)},
          ${txt(r.land)}, ${num(r.landAmount)}
         FROM upd
       ON CONFLICT (id) DO NOTHING
       RETURNING id
     ), item AS (
       INSERT INTO yuplink.user_game_item (id, wallet, account_id, template_id, kind, source, obtained_at)
       SELECT ${sqlStr(craftItemId(job.id))}, ${sqlStr(owner.wallet)}, ${sqlStr(owner.account)},
              ${sqlStr(tpl)}, 'artifact', ${gen ? "'generated'" : "'crafted'"}, now()
         FROM upd
       ON CONFLICT (id) DO NOTHING
       RETURNING id
     )
     SELECT (SELECT count(*) FROM upd)::int AS done, (SELECT count(*) FROM item)::int AS items;`,
    // Запрос уже с WITH и изменениями внутри — обёртку не берём (вложенный
    // WITH с INSERT Postgres не принимает); строки и так приходят объектами.
  )) as Array<{ done: number }> | null;
  return Number(out?.[0]?.done) > 0;
}
