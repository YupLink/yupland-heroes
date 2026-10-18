// Кого можно поставить на грядку: герои аккаунта и то, где они уже заняты.
//
// На поле выходит ЛЮБОЙ герой игрока — редкий, эпический или легендарный;
// сила и уровень тут ни при чём, работают руки. Занятый герой в списке
// остаётся, но с пометкой: видно, что он уже стоит на другой грядке.
//
// «Спящие» герои — те, что лежат в инвентаре предметом и экземпляра ещё не
// имеют (его заводят лениво, при первой прокачке или выборе основным). Их тут
// не было вовсе: половину коллекции нельзя было поставить на грядку, хотя в
// замке и таверне те же герои выбирались. Отдаём их ссылкой `wake:<шаблон>` —
// постановка разбудит героя сама.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { raidOwner } from "./owner";
import { normalizeHeroRarity } from "@/lib/hero/heroSlots";
import { activeRest, awakeSql, heroLockSql, HERO_IS_MAIN, HERO_RESTING } from "../hero-rest";

export type FieldHero = {
  id: string;
  name: string;
  imageUrl: string | null;
  rarity: string;
  level: number;
  /** Где уже работает: «q,r» другой грядки. null — свободен. */
  busyAt: string | null;
  /** До какого момента отдыхает (ISO): на грядку не встаёт. null — нет. */
  restUntil: string | null;
  /** Основной: на грядку не встаёт — он основной. */
  main: boolean;
};

type Row = {
  id: string;
  template_id: string;
  level: number | string;
  rarity: string;
  name: string;
  image_url: string | null;
  busy_q: number | null;
  busy_r: number | null;
  rest_until: string | null;
  main: boolean | null;
};

/** Герои аккаунта с пометкой занятости. Свободные идут первыми. */
export async function fieldHeroes(wallet: string, mapId: string): Promise<FieldHero[]> {
  const account = await raidOwner(wallet);
  if (!account) return [];
  const rows = (await mcpExec(
    `SELECT h.id, h.level, h.rarity, h.template_id, t.image_url,
            COALESCE(NULLIF(t.name, ''), 'Герой') AS name,
            w.q AS busy_q, w.r AS busy_r, h.rest_until, (h.selected_at IS NOT NULL) AS main
       FROM yuplink.hero_instance h
       LEFT JOIN yuplink.mystic_item_template t ON t.id = h.template_id
       LEFT JOIN yuplink.raid_field_worker w
              ON w.hero_id = h.id AND w.map_id = ${sqlStr(mapId)}
      WHERE h.account_id = ${sqlStr(account)}
      ORDER BY (w.q IS NULL) DESC, h.level DESC LIMIT 60;`,
    { wrapJson: true },
  ).catch(() => [])) as Row[];
  const awake = (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    imageUrl: r.image_url,
    rarity: normalizeHeroRarity(r.rarity),
    level: Number(r.level) || 1,
    busyAt: r.busy_q === null || r.busy_r === null ? null : `${r.busy_q},${r.busy_r}`,
    restUntil: activeRest(r.rest_until),
    main: !!r.main,
  }));

  const { listDormantHeroes } = await import("../heroes-list-dormant");
  const { wakeRef } = await import("../heroes-wake");
  const dormant = await listDormantHeroes(account).catch(() => []);
  return [
    ...awake,
    ...dormant.map((d) => ({
      id: wakeRef(d.itemId),
      name: d.name,
      imageUrl: d.imageUrl,
      rarity: normalizeHeroRarity(d.rarity),
      // Спящий ещё не качался: показываем первый уровень, как и везде.
      level: 1,
      busyAt: null as string | null,
      restUntil: null as string | null,
      main: false,
    })),
  ];
}

/**
 * Постановка на грядку с условием в самом операторе: основной и отдыхающий не
 * батрачат. Перед оператором — замок героя (heroLockSql): «сделать основным»
 * держит тот же, и из двух одновременных запросов второй увидит первый. CTE с
 * изменчивой функцией Postgres не встраивает — raid_field_join зовётся ровно
 * для строк, прошедших условие. Ответ — _row {joined}; 0 — не поставили.
 */
export function guardedJoinSql(o: {
  mapId: string;
  q: number;
  r: number;
  account: string;
  wallet: string;
  heroId: string;
}): string {
  return `${heroLockSql(o.heroId)}
   WITH h AS (
     SELECT id FROM yuplink.hero_instance
      WHERE id = ${sqlStr(o.heroId)} AND selected_at IS NULL AND ${awakeSql()}
   ),
   j AS (
     SELECT yuplink.raid_field_join(${sqlStr(o.mapId)}, ${o.q}, ${o.r},
            ${sqlStr(o.account)}, ${sqlStr(o.wallet)}, h.id) FROM h
   )
   SELECT row_to_json(_t.*) AS _row FROM (SELECT (SELECT count(*) FROM j)::int AS joined) _t;`;
}

/** Герой принадлежит этому аккаунту? Иначе на чужого можно было бы «работать». */
export async function requireOwnHero(
  wallet: string,
  heroIdOrRef: string,
): Promise<{ id: string; name: string; rarity: string; level: number }> {
  const account = await raidOwner(wallet);
  // Спящего будим здесь же: владение проверяет само пробуждение (герой обязан
  // лежать предметом в инвентаре), дальше он уже обычный экземпляр.
  const { resolveHeroInstanceId } = await import("../heroes-wake");
  const heroId = await resolveHeroInstanceId(wallet, account, heroIdOrRef);
  const rows = (await mcpExec(
    `SELECT h.id, h.level, h.rarity, COALESCE(NULLIF(t.name, ''), 'Герой') AS name,
            (h.rest_until > now()) AS resting, (h.selected_at IS NOT NULL) AS main
       FROM yuplink.hero_instance h
       LEFT JOIN yuplink.mystic_item_template t ON t.id = h.template_id
      WHERE h.id = ${sqlStr(heroId)} AND h.account_id = ${sqlStr(account)} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{
    id: string;
    name: string;
    rarity: string;
    level: number;
    resting: boolean | null;
    main: boolean | null;
  }>;
  const hero = rows?.[0];
  if (!hero) throw new Error("Это не твой герой");
  // Отдыхающий после снятия с грядки никуда не встаёт (hero-rest.ts).
  if (hero.resting) throw new Error(HERO_RESTING);
  // Основной не батрачит — работает, значит не основной (владелец 29.09).
  if (hero.main) throw new Error(HERO_IS_MAIN);
  return {
    id: hero.id,
    name: hero.name,
    rarity: normalizeHeroRarity(hero.rarity),
    level: Number(hero.level) || 1,
  };
}
