// Закреп клетки за охранником шахты — один оператор с ключом операции.
// (Охрана магического сундука с третьей редакции ставится вместе со списанием
// босса одним оператором — chest-place-sql.ts.)
//
// Прежний `INSERT … ON CONFLICT DO UPDATE … WHERE (мёртв) RETURNING` был той
// самой «миной» из mcpClient.ts: мост повторяет запрос вслепую, и повтор после
// коммита видел СВОЕГО же живого охранника как чужого — «Охранник уже стоит»
// до списания босса, то есть охрана бесплатно. Теперь закреп пишет ключ в
// raid_backpack_op, и повтор по ключу отвечает «закреплено».
//
// Мёртвого заменяем, но не труп охраны магического сундука, чей захват ещё
// не прошёл (killed_by есть, сундук чужой победителю): победа уже отдала
// сундук победителю, и новый охранник поверх трупа отнял бы её мимо боя
// (правило владельца 27.09.2026, вторая редакция; chest-seize.ts).
import { sqlStr } from "@/server/api/raid-shared";
import type { EncounterTarget } from "@/server/api/beta-raid/encounter-target";

export function claimGuardSql(o: {
  mapId: string;
  q: number;
  r: number;
  account: string;
  templateId: string;
  tpl: EncounterTarget;
  op: string;
}): string {
  const { tpl } = o;
  const op = sqlStr(o.op);
  const abilities = sqlStr(JSON.stringify(tpl.abilities ?? []));
  return `WITH prior AS (
       SELECT EXISTS (SELECT 1 FROM yuplink.raid_backpack_op WHERE op = ${op}) AS was
     ),
     g AS (
       INSERT INTO yuplink.raid_mine_guard
          (map_id,q,r,owner_account,boss_template_id,name,image,background,
           max_hp,current_hp,damage,abilities,interaction_cost,killed_at,placed_at)
       SELECT ${sqlStr(o.mapId)}, ${o.q}, ${o.r}, ${sqlStr(o.account)}, ${sqlStr(o.templateId)},
              ${sqlStr(tpl.name)}, ${tpl.imageUrl ? sqlStr(tpl.imageUrl) : "NULL"},
              ${tpl.backgroundUrl ? sqlStr(tpl.backgroundUrl) : "NULL"},
              ${tpl.maxHp}, ${tpl.maxHp},
              ${tpl.damage != null ? sqlStr(String(tpl.damage)) : "NULL"},
              ${abilities}::jsonb, ${tpl.interactionCost}, NULL, now()
         FROM prior WHERE NOT prior.was
       ON CONFLICT (map_id,q,r) DO UPDATE SET
         owner_account=EXCLUDED.owner_account, boss_template_id=EXCLUDED.boss_template_id,
         name=EXCLUDED.name, image=EXCLUDED.image, background=EXCLUDED.background,
         max_hp=EXCLUDED.max_hp, current_hp=EXCLUDED.max_hp, damage=EXCLUDED.damage,
         abilities=EXCLUDED.abilities, interaction_cost=EXCLUDED.interaction_cost,
         killed_at=NULL, killed_by=NULL, placed_at=now()
       WHERE (yuplink.raid_mine_guard.killed_at IS NOT NULL
              OR yuplink.raid_mine_guard.current_hp <= 0)
         AND NOT (yuplink.raid_mine_guard.killed_by IS NOT NULL AND EXISTS (
               SELECT 1 FROM yuplink.raid_magic_chest mc
                WHERE mc.map_id = yuplink.raid_mine_guard.map_id
                  AND mc.q = yuplink.raid_mine_guard.q AND mc.r = yuplink.raid_mine_guard.r
                  AND mc.owner_account <> yuplink.raid_mine_guard.killed_by))
       RETURNING map_id
     ),
     claim AS (
       INSERT INTO yuplink.raid_backpack_op (op) SELECT ${op} FROM g
       ON CONFLICT (op) DO NOTHING
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT ((SELECT was FROM prior) OR EXISTS (SELECT 1 FROM g)) AS placed
     ) _t;`;
}
