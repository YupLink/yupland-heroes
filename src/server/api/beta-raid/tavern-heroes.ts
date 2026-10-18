// Кого таверна показывает в списке смены — вместе со «спящими».
//
// Экземпляр героя (hero_instance) заводится лениво: пока героя не прокачали и
// ни разу не ставили основным, он живёт предметом в инвентаре. Таверна читала
// только экземпляры, поэтому герой нулевого уровня в ней «попросту не виден»,
// хотя в замке его выбрать можно — там спящих будят на лету.
//
// Здесь оба списка сходятся: у экземпляра есть id, у спящего — только шаблон,
// и экземпляр ему заводится в момент смены.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { listDormantHeroes } from "../heroes-list-dormant";
import { MAX_LEVEL_BY_RARITY, type HeroRarity } from "@/lib/heroLevels";
import { raidOwner } from "./owner";
import { activeRest } from "../hero-rest";

export type TavernHero = {
  /** null у спящего: экземпляра ещё нет, есть только шаблон. */
  id: string | null;
  templateId: string;
  name: string;
  imageUrl: string | null;
  race: string | null;
  spec: string | null;
  rarity: string;
  level: number;
  maxLevel: number;
  selected: boolean;
  /** До какого момента отдыхает (ISO): основным не встаёт. null — нет. */
  restUntil: string | null;
  /** «q,r» грядки, где батрачит: основным не встаёт. null — свободен. */
  busyField: string | null;
};

type HeroRowDb = {
  id: string;
  template_id: string;
  level: number | string;
  rarity: string;
  selected_at: string | null;
  name: string;
  image_url: string | null;
  race: string | null;
  specialization: string | null;
  rest_until: string | null;
  busy_q: number | null;
  busy_r: number | null;
};

export async function tavernHeroes(wallet: string, list: string): Promise<TavernHero[]> {
  const rows = (await mcpExec(
    `SELECT h.id, h.template_id, h.level, h.rarity, h.selected_at, t.image_url, t.race,
            t.specialization, COALESCE(NULLIF(t.name, ''), 'Герой') AS name, h.rest_until,
            w.q AS busy_q, w.r AS busy_r
       FROM yuplink.hero_instance h
       LEFT JOIN yuplink.mystic_item_template t ON t.id = h.template_id
       LEFT JOIN yuplink.raid_field_worker w ON w.hero_id = h.id
      WHERE h.account_id IN (${list})
      ORDER BY h.selected_at DESC NULLS LAST, h.created_at DESC LIMIT 60;`,
    { wrapJson: true },
  ).catch(() => [])) as HeroRowDb[];

  const awake: TavernHero[] = (rows ?? []).map((r) => ({
    id: r.id,
    templateId: r.template_id,
    name: r.name,
    imageUrl: r.image_url,
    race: r.race,
    spec: r.specialization,
    rarity: r.rarity,
    // Ноль у экземпляра законен (разбудили, но ещё не качали) — не подменяем
    // его единицей, иначе в таверне и в инвентаре стоят разные уровни.
    level: Number(r.level) || 0,
    maxLevel: MAX_LEVEL_BY_RARITY[r.rarity as HeroRarity] ?? 20,
    selected: !!r.selected_at,
    restUntil: activeRest(r.rest_until),
    busyField: r.busy_q === null || r.busy_r === null ? null : `${r.busy_q},${r.busy_r}`,
  }));

  const account = await raidOwner(wallet);
  // Спящие — копии без экземпляра: проснувшихся listDormantHeroes отсекает сам.
  const dormant = await listDormantHeroes(account).catch(() => []);

  return [
    ...awake,
    ...dormant.map((d) => ({
      id: null,
      templateId: d.templateId,
      name: d.name,
      imageUrl: d.imageUrl,
      race: d.race,
      spec: d.specialization,
      rarity: d.rarity,
      level: 0,
      maxLevel: d.maxLevel,
      selected: false,
      restUntil: null,
      busyField: null,
    })),
  ];
}

/**
 * id экземпляра, которым будем менять героя.
 *
 * У спящего его нет — заводим здесь же, как это делает выбор героя в замке
 * (heroes-select): экземпляр появляется ровно в момент, когда героя впервые
 * ставят основным, с той же редкостью, что даст будущая прокачка.
 */
export async function tavernHeroInstanceId(
  wallet: string,
  heroId: string | undefined,
  templateId: string | undefined,
): Promise<string> {
  if (heroId) return heroId;
  if (!templateId) throw new Error("Не выбран герой");
  const { wakeHeroInstance } = await import("../heroes-wake");
  return wakeHeroInstance(wallet, await raidOwner(wallet), templateId);
}
