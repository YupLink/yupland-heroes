// Награда за цель кладётся в очередь, а не начисляется молча.
//
// Игрок должен видеть, что и за кого ему причитается: плашка над картой →
// окно со списком по целям → кнопка «Забрать». Начисление происходит только
// при получении (claimRaidRewards), до этого запись висит с claimed_at IS NULL.
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { StackOrigin } from "@/server/api/beta-raid/stack-origin";

export type QueuedReward = {
  account: string;
  /** Карта и цикл — по ним награда числится за конкретным рейдом. */
  mapId: string;
  cycleNo: number;
  /** Имя цели: «Зимний Йети (1 Lv)», «Сундук сокровищ» — его видит игрок. */
  sourceName: string;
  /** id шаблона цели — на будущее, для группировки и картинок. */
  targetId?: string | null;
  kind: string;
  amount: number;
  /**
   * Ссылка вида награды. Пак и предмет кладут сюда свой шаблон, ресурс — код
   * (gold/stone/wood/diamonds), свой товар — id справочника (cst_…). Колонка
   * в базе так и называется pack_id: заводить вторую ради тех же строк было
   * бы миграцией на ровном месте, а reward_kind — обычный text без CHECK.
   */
  packId?: string | null;
  place?: number | null;
  damage?: number | null;
  /**
   * Происхождение (ПРАВИЛА §8.18, колонка origin — origin-02): бой с боссом —
   * "mob", объект карты, декор и прочие награды рейда — "loot". Свой товар
   * ляжет в рюкзак с этой меткой и годится в магический сундук. Не задано —
   * по boss_id (raid-reward-live rewardOriginSql).
   */
  origin?: StackOrigin | null;
  /**
   * Ключ выдачи (мешочки, §8.21): id строки = 'rr_' || md5(ключа) и повтор —
   * ON CONFLICT DO NOTHING. Повтор моста после коммита и запасной путь той же
   * выдачи второй строки не кладут. Нет — случайный id, как было.
   */
  key?: string;
};

const num = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? "NULL" : String(Math.round(v));

/**
 * Урон — справочная копия, награду он ронять не должен. Колонка bigint
 * (raid-reward-01): до 03.10 была integer, и у «Лесного Бога» (10 млрд HP)
 * первое место не получало ничего — INSERT падал на «integer out of range».
 * Потолок — MAX_SAFE_INTEGER: дальше JS теряет точность, а String() уходит в
 * «1e+21», которого bigint не примет.
 */
const dmg = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v)
    ? "NULL"
    : String(Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(v))));

/** Ставит одну награду в очередь получения. Ничего не начисляет. */
export async function queueEncounterReward(r: QueuedReward): Promise<void> {
  if (!(r.amount > 0)) return;
  const id = r.key ? `'rr_' || md5(${sqlStr(r.key)})` : sqlStr(`rr_${nanoid(12)}`);
  await mcpExec(
    `INSERT INTO yuplink.raid_reward
       (id, location_id, cycle_no, account_id, place, damage, reward_kind, reward_amount,
        pack_id, boss_id, source_name, created_at, origin)
     VALUES (${id}, ${sqlStr(r.mapId)}, ${Math.floor(r.cycleNo) || 0},
             ${sqlStr(r.account)}, ${num(r.place)}, ${dmg(r.damage)}, ${sqlStr(r.kind)},
             ${Number(r.amount) || 0}, ${r.packId ? sqlStr(r.packId) : "NULL"},
             ${r.targetId ? sqlStr(r.targetId) : "NULL"}, ${sqlStr(r.sourceName)}, now(),
             ${r.origin ? sqlStr(r.origin) : "NULL"})${r.key ? "\n     ON CONFLICT (id) DO NOTHING" : ""};`,
  );
}
