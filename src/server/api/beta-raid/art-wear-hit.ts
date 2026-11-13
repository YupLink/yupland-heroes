// Износ надетых артефактов за БОЙ (владелец, 22.10.2026; lib/hero/artWear.ts).
//
// Бой = цель, а не удар (владелец, 23.10.2026: «бой = босс — если 500 боёв, то
// это = 500 боссов можно ударить, и неважно сколько раз ты их ударил — хоть 1
// раз, хоть 100»). Ключ боя (fight) — одна жизнь цели: у босса/моба строка HP,
// её поколение и начало жизни; у охранника — клетка и время постановки. Каждый
// надетый артефакт за один бой изнашивается один раз (art_wear_fight, PK
// item_id+fight): второй, сотый удар по той же цели его не трогает; цель
// возродилась — новый бой. Артефакт перешёл к другому герою и бьёт ту же цель —
// тот же бой.
//
// Зовут оба боя бета-рейда сразу после того, как урон записан: энкаунтер
// (босс, моб) и охрана шахты/сундука. Удар не засчитан — сюда не доходят, и
// артефакт не стареет за несостоявшийся бой.
//
// Один запрос: ключ удара, отметка боя на каждый надетый артефакт, износ тех,
// у кого отметка новая, и уборка старых ключей и отметок. Надетое читается из hero_instance.equipped В МОМЕНТ удара, а
// не из 15-секундного кэша силы героя.
//   • Повтор моста (слепой ретрай) находит ключ и второй раз не снимает.
//   • Два удара по РАЗНЫМ целям — два боя, каждый снимает свой шаг: износ
//     считается в самом UPDATE (wear + шаг) под замком строки. Два удара по
//     одной цели разом — отметку боя вставит один (ON CONFLICT), шаг один.
//   • Сломанный (wear = 100) не трогаем, выше 100 не бывает.
// Сбой износа удар не отменяет — пишем в лог, как побочки боя.
//
// Поломка = снятие (владелец, 23.10.2026; §8.63 п.3; lib/hero/artBroken.ts):
// при запущенной механике (art-repair-gate.artBrokenOn) тот же запрос снимает
// сломанное со ВСЕХ героев аккаунта (как unequipFromOtherHeroes в heroes-gear —
// сам предмет остаётся в инвентаре) и пишет событие art_break_notice для плашки
// над героем. Ключ события — от ключа удара: повтор моста ничего не задвоит.
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { artStepSql } from "@/lib/hero/artWear";
import { parseArtBreakNotes, type ArtBreakNote } from "@/lib/hero/artBroken";
import { artBrokenOn } from "../art-repair/art-repair-gate";
// Конь (§8.84) не изнашивается: износ — только у артефактов, что дерутся.
import { MOUNT_SLOT } from "@/lib/hero/mount";

/** Надетое героем — пары «место → id»; битая запись (не объект) — пусто. */
const equippedOf = (alias: string) =>
  `jsonb_each_text(CASE WHEN jsonb_typeof(${alias}.equipped::jsonb) = 'object'
                        THEN ${alias}.equipped::jsonb ELSE '{}'::jsonb END)`;

/** id надетого на героя — несвязанным подзапросом (InitPlan, строки по pkey). */
const wornIds = (hero: string) =>
  `ARRAY(SELECT e.value FROM yuplink.hero_instance q, ${equippedOf("q")} e
                                 WHERE q.id = ${hero})`;

/**
 * Снятие сломанного (только при запущенной механике). gone — что сломалось
 * ЭТИМ ударом (RETURNING износа) плюс уже сломанное, что ещё надето на бойца:
 * осталось с тех пор, когда механика была выключена, или надевашка проскочила
 * в гонке с ударом. Второй SELECT видит износ ДО удара — множества не
 * пересекаются. Снимаем со всех героев аккаунта, одним UPDATE.
 */
function stripCtes(hero: string, op: string): string {
  return `,
     gone AS (
       SELECT id, account_id, template_id, name, image_url FROM upd WHERE wear >= 100
       UNION ALL
       SELECT u.id, u.account_id, u.template_id, t.name, t.image_url
         FROM yuplink.user_game_item u
         JOIN yuplink.hero_instance h ON h.id = ${hero} AND u.account_id = h.account_id
         LEFT JOIN yuplink.mystic_item_template t ON t.id = u.template_id
        WHERE EXISTS (SELECT 1 FROM claim)
          AND u.kind = 'artifact' AND u.wear >= 100
          AND u.id = ANY (${wornIds(hero)})
     ),
     strip AS (
       UPDATE yuplink.hero_instance x
          SET equipped = COALESCE((
                SELECT jsonb_object_agg(e.key, e.value)
                  FROM jsonb_each_text(x.equipped::jsonb) e
                 WHERE e.value NOT IN (SELECT id FROM gone)
              ), '{}'::jsonb),
              updated_at = now()
        WHERE EXISTS (SELECT 1 FROM gone)
          AND x.account_id = (SELECT b.account_id FROM yuplink.hero_instance b WHERE b.id = ${hero})
          AND jsonb_typeof(x.equipped::jsonb) = 'object'
          AND EXISTS (SELECT 1 FROM ${equippedOf("x")} y WHERE y.value IN (SELECT id FROM gone))
       RETURNING x.id
     ),
     note AS (
       INSERT INTO yuplink.art_break_notice
              (id, account_id, item_id, template_id, name, image_url, hero_id)
       SELECT 'abn_' || ${sqlStr(op)} || '_' || g.id, g.account_id, g.id, g.template_id,
              g.name, g.image_url, ${hero}
         FROM gone g
       ON CONFLICT (id) DO NOTHING
       RETURNING id, item_id, name, image_url
     )`;
}

/**
 * SQL удара — текстом: так его видно в тестах и на живой базе.
 *
 * Надетые id — массивом из НЕсвязанного подзапроса (InitPlan): строки берутся
 * по первичному ключу. Связанный EXISTS по h перебирал ВСЕ артефакты аккаунта
 * на каждый удар — у коллекционера на 3 294 штуки это 8,5 мс и 318 страниц
 * против 0,45 мс и 45 (EXPLAIN ANALYZE на проде, 22.10.2026).
 *
 * strip — механика поломки запущена: сломанное снимается тем же запросом.
 */
export function artWearHitSql(heroId: string, op: string, fight: string, strip = false): string {
  const hero = sqlStr(heroId);
  return `WITH claim AS (
       INSERT INTO yuplink.art_wear_op (op, hero_id) VALUES (${sqlStr(op)}, ${hero})
       ON CONFLICT (op) DO NOTHING
       RETURNING op
     ),
     fresh AS (
       INSERT INTO yuplink.art_wear_fight (item_id, fight)
       SELECT u.id, ${sqlStr(fight)}
         FROM yuplink.user_game_item u, yuplink.hero_instance h
        WHERE EXISTS (SELECT 1 FROM claim)
          AND h.id = ${hero} AND u.account_id = h.account_id
          AND u.kind = 'artifact' AND u.wear < 100
          AND u.id = ANY (${wornIds(hero)})
       ON CONFLICT (item_id, fight) DO NOTHING
       RETURNING item_id
     ),
     upd AS (
       UPDATE yuplink.user_game_item u
          SET wear = LEAST(100, u.wear + ${artStepSql("t.rarity")})
         FROM yuplink.mystic_item_template t
        WHERE u.id IN (SELECT item_id FROM fresh)
          AND t.id = u.template_id AND u.wear < 100
          AND COALESCE(t.slot, '') <> ${sqlStr(MOUNT_SLOT)}
       RETURNING u.id, u.wear, u.account_id, u.template_id, t.name, t.image_url
     ),
     sweep AS (
       DELETE FROM yuplink.art_wear_op o
        WHERE o.hero_id = ${hero} AND o.at < now() - interval '1 day'
          AND EXISTS (SELECT 1 FROM claim)
     ),
     sweep_fight AS (
       DELETE FROM yuplink.art_wear_fight f
        WHERE f.item_id = ANY (${wornIds(hero)}) AND f.at < now() - interval '30 days'
          AND EXISTS (SELECT 1 FROM claim)
     )${strip ? stripCtes(hero, op) : ""}
     SELECT (SELECT count(*) FROM claim)::int AS claimed,
            (SELECT count(*) FROM upd)::int AS worn,
            (SELECT count(*) FROM upd WHERE wear >= 100)::int AS broke${
              strip
                ? `,
            (SELECT count(*) FROM strip)::int AS stripped,
            (SELECT COALESCE(json_agg(json_build_object('id', n.id, 'itemId', n.item_id,
                    'name', n.name, 'imageUrl', n.image_url) ORDER BY n.id), '[]'::json)
               FROM note n)::text AS notes`
                : ""
            };`;
}

// Целые колонки, без row_to_json: int приезжает числом и прямым каналом, и мостом.
type HitRow = { claimed?: unknown; broke?: unknown; stripped?: unknown; notes?: unknown };

/**
 * Снять износ с надетого на героя за удар — но каждому артефакту не больше
 * одного раза за бой (fight — ключ жизни цели). Сломалось или снялось что-то —
 * сбрасываем кэш силы героя: следующий бой обязан идти уже без этого
 * артефакта. Возвращает события поломки для плашки над героем (пусто, если
 * механика не запущена или ничего не сломалось).
 */
export async function wearHeroArtifacts(
  wallet: string,
  heroId: string,
  fight: string,
): Promise<ArtBreakNote[]> {
  try {
    const strip = await artBrokenOn(wallet);
    const sql = artWearHitSql(heroId, `aw_${nanoid(14)}`, fight, strip);
    const rows = (await mcpExec(sql)) as HitRow[];
    const row = rows?.[0];
    // Ключ уже стоял — это повтор моста, и что он сломал в первый раз, не
    // видно: кэш сбрасываем на всякий случай (повторы редки).
    if (row && (Number(row.broke) > 0 || Number(row.claimed) === 0 || Number(row.stripped) > 0)) {
      const { invalidateHeroPower } = await import("./hero-power");
      invalidateHeroPower(wallet);
    }
    return parseArtBreakNotes(row?.notes);
  } catch (e) {
    console.warn("[art-wear] износ артефактов не записался:", e);
    return [];
  }
}
