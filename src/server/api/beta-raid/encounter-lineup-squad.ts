// Отряд героя выходит в бой в том составе, в каком его собрали в замке.
//
// Отличие от resolveLineup (encounter-lineup.ts) принципиальное: тут НЕТ
// автодобора. Оглушённая фишка просто остаётся дома, и в бой идут девять из
// десяти — отряд не переклеивается под каждую драку. Зато каждой фишке
// подбирается конкретный экземпляр: без chip_id яду и оглушению босса не на
// что сесть, и половина его способностей молча пропадает.
import { mcpExec } from "../../db/mcpClient";
import { type MatchChip, type SquadEntry, matchSquadToChips } from "@/lib/heroSquadMatch";
import { sqlStr } from "../raid-shared";
import { raidOwner } from "./owner";
import { SQUAD_SLOTS } from "../heroes-squad";
import type { SimChip } from "./encounter-sim";

type InventoryRow = {
  id: string;
  template_id: string;
  level: number;
  serial_no: number | null;
  name: string | null;
  ready: boolean;
};

export type HeroSquadLineup = {
  lineup: SimChip[];
  /** Сколько записей в отряде всего. */
  total: number;
  /** Фишка есть, но не боеспособна: оглушена или отдыхает после передачи. */
  busy: number;
  /** Фишки нет вовсе — сожгли в крафте, продали или вывели в NFT. */
  gone: number;
};

const toMatchChip = (r: InventoryRow): MatchChip => ({
  id: r.id,
  templateId: r.template_id,
  level: Number(r.level),
  serialNo: r.serial_no,
  name: r.name,
});

/**
 * Инвентарь одним запросом: и боеспособные, и все остальные. Условия
 * боеспособности — дословно те же, что в resolveLineup, иначе оглушённая
 * фишка вышла бы в бой через отряд героя в обход наказания босса.
 */
async function loadInventory(wallet: string, squad: SquadEntry[]): Promise<InventoryRow[]> {
  const list = sqlStr(await raidOwner(wallet));
  // Берём ТОЛЬКО те шаблоны и уровни, что стоят в отряде. Раньше тянули весь
  // инвентарь: у активного игрока это больше тысячи строк на КАЖДЫЙ удар, а
  // бой и так упирается в задержку шлюза — именно там он и висел секундами.
  const pairs = [...new Set(squad.map((e) => `${e.templateId}|${Number(e.level)}`))]
    .map((k) => {
      const [tpl, lvl] = k.split("|");
      return `(c.template_id = ${sqlStr(tpl)} AND c.level = ${Number(lvl)})`;
    })
    .join(" OR ");
  if (!pairs) return [];
  const rows = (await mcpExec(
    `SELECT c.id, c.template_id, c.level, c.serial_no, t.name,
            (
              (c.rest_until IS NULL OR c.rest_until <= now())
              AND NOT EXISTS (
                SELECT 1 FROM yuplink.chip_effects e
                 WHERE e.chip_id = c.id AND e.kind = 'stun' AND e.expires_at > now()
              )
            ) AS ready
       FROM yuplink.user_chip_inventory c
       LEFT JOIN yuplink.chip_templates t ON t.id = c.template_id
      WHERE c.account_id IN (${list}) AND c.status = 'owned' AND (${pairs})
      ORDER BY c.level DESC;`,
    { wrapJson: true },
  )) as InventoryRow[];
  return rows ?? [];
}

/**
 * Кто из закреплённого отряда реально выйдет в бой.
 *
 * null — отряд НЕ ЗАКРЕПЛЁН (пуст): вызывающий идёт прежней веткой с
 * автоподбором фишек. Так и задумано: у героев, выбранных до появления замка,
 * отряд пустой, и отказ здесь отнял бы у них разом все бои — боссов, сундуки,
 * шахты. Боевых бонусов герой при этом не даёт (см. hero-power.computeHeroPower):
 * усиливать состав, который игрок не собирал, не за что.
 *
 * busy и gone считаются раздельно намеренно: «оглушена» лечится ожиданием и
 * игроку надо сказать именно это, а «фишки больше нет» — повод сходить в
 * замок и пересобрать отряд.
 */
export async function resolveHeroSquadLineup(
  wallet: string,
  squad: SquadEntry[],
): Promise<HeroSquadLineup | null> {
  const entries = squad.slice(0, SQUAD_SLOTS);
  const total = entries.length;
  if (total === 0) return null;

  const inventory = await loadInventory(wallet, entries);
  const ready = inventory.filter((r) => r.ready === true).map(toMatchChip);
  const { picked, missing } = matchSquadToChips(entries, ready);

  // Кому не нашлось готового экземпляра — смотрим, есть ли фишка вообще.
  // Экземпляры, уже ушедшие в строй, из пула убираем: иначе одна и та же
  // фишка объяснила бы сразу две пустые позиции.
  const used = new Set(picked.map((p) => p.chipId));
  const rest = inventory.filter((r) => !used.has(r.id)).map(toMatchChip);
  const gone = missing.length > 0 ? matchSquadToChips(missing, rest).missing.length : 0;

  // Отказ остаётся ровно на один случай: отряд собран, но в бой из него не
  // выходит никто. Тут игроку и правда нечем драться, и объяснить надо, чем
  // именно занят состав — ждать или пересобирать.
  if (picked.length === 0) {
    throw new Error(
      gone === total
        ? "Отряд героя разбежался — этих фишек больше нет, собери его заново в замке"
        : "Весь отряд сейчас недоступен — фишки оглушены или отдыхают после передачи",
    );
  }

  return {
    lineup: picked.map((p) => ({
      templateId: p.templateId,
      level: p.level,
      chipId: p.chipId,
      serialNo: p.serialNo,
      name: p.name,
    })),
    total,
    busy: missing.length - gone,
    gone,
  };
}
