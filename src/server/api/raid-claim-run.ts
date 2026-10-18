// Получение наград из очереди: одна строка не должна ронять весь клейм.
//
// Раньше цикл при ЛЮБОЙ ошибке возвращал строку в очередь и бросал наружу:
// одна недоставляемая награда (нет выбранного героя, полный рюкзак) обрывала
// весь клейм, и игрок не получал даже лайки, лежавшие в очереди рядом.
// Теперь «бытовая» причина откладывает ОДНУ строку и попадает в
// предупреждения, а наружу летит только настоящий сбой базы.
//
// Зависимости приходят снаружи (take/release/grant) — так этот порядок можно
// проверить тестом, не трогая живую ручку клейма.
import { SOFT_GRANT_ERRORS } from "./raid-reward-extra";
import { originOf, type StackOrigin } from "@/server/api/beta-raid/stack-origin";

export type ClaimRow = {
  id: string;
  reward_kind: string;
  reward_amount: number;
  pack_id: string | null;
  raid_location_id: string;
  raid_cycle_no: number;
  /**
   * Происхождение (raid-reward-live rewardOriginSql): 'mob' — бой, 'loot' —
   * объект карты, декор, грабёж сундука; null — без метки (сам сундук из
   * «Добычи»). Свой товар с меткой игрок потом положит в магический сундук.
   */
  origin: string | null;
};

export type ClaimDeps = {
  /** Захватить строку. false — её прямо сейчас забирает параллельный заход. */
  take(row: ClaimRow): Promise<boolean>;
  /** Вернуть строку в очередь: награда не доехала. */
  release(row: ClaimRow): Promise<void>;
  grant(row: ClaimRow, ref: string): Promise<void>;
};

export type ClaimOutcome = {
  credited: number;
  summary: Record<string, number>;
  /** Ключи для игрока: «market.need_hero», «market.backpack_need:3:1». */
  warnings: string[];
};

/** Выдача одной награды — форма grantRaidReward (raid-helpers). */
export type GrantFn = (
  wallet: string,
  kind: string,
  amount: number,
  packId: string | null,
  ref: string,
  opts?: { origin?: StackOrigin | null },
) => Promise<void>;

/**
 * grant для runRewardClaim: строка очереди → выдача. Происхождение едет
 * вместе со строкой до самого рюкзака — иначе добыча ложилась бы покупкой, и
 * в сундук её было бы не положить.
 */
export function grantRow(grant: GrantFn, wallet: string): ClaimDeps["grant"] {
  return (row, ref) =>
    grant(wallet, row.reward_kind, Number(row.reward_amount) || 0, row.pack_id, ref, {
      origin: originOf(row.origin),
    });
}

const msgOf = (e: unknown): string => (e instanceof Error ? e.message : String(e ?? ""));

/** Отказ, с которым награда просто ждёт в очереди, а не считается сбоем. */
export function isSoftGrantError(e: unknown): boolean {
  const msg = msgOf(e);
  return SOFT_GRANT_ERRORS.some((key) => msg.startsWith(key));
}

/**
 * ref начисления. Свой на КАЖДУЮ строку: один общий ключ на цикл склеивал
 * движения по билетам и мешал разбирать историю.
 */
export function claimRef(row: ClaimRow): string {
  return `raidtour:${row.raid_location_id}:c${row.raid_cycle_no}:${row.id}`;
}

/** Ключ строки итога: игроку показываем вид, а не техническое имя колонки. */
function summaryKey(row: ClaimRow): string {
  if (row.reward_kind === "pack") return "пак";
  if (row.reward_kind === "custom") return "товар";
  if (row.reward_kind === "resource") return row.pack_id ?? "resource";
  return row.reward_kind;
}

export async function runRewardClaim(rows: ClaimRow[], deps: ClaimDeps): Promise<ClaimOutcome> {
  let credited = 0;
  const summary: Record<string, number> = {};
  const warnings: string[] = [];
  // Рюкзак полон (free=0): строки того же товара с таким же или большим
  // количеством тоже не влезут — не гоняем по каждой take→grant→release
  // (у группы «Хлеб» на проде 267 строк = ~1,5 тыс. запросов на один тап).
  // Дробные меньше упавшей ещё пробуем: они ложатся в неполную ячейку.
  let fullFrom: { kind: string; packId: string | null; amount: number } | null = null;
  for (const row of rows) {
    if (
      fullFrom &&
      row.reward_kind === fullFrom.kind &&
      (row.pack_id ?? null) === fullFrom.packId &&
      (Number(row.reward_amount) || 0) >= fullFrom.amount
    )
      continue;
    if (!(await deps.take(row))) continue;
    try {
      await deps.grant(row, claimRef(row));
    } catch (e) {
      await deps.release(row);
      if (!isSoftGrantError(e)) throw e;
      const msg = msgOf(e);
      if (!warnings.includes(msg)) warnings.push(msg);
      if (/^market\.(backpack|potion_bag)_need:\d+:0$/.test(msg)) {
        fullFrom = {
          kind: row.reward_kind,
          packId: row.pack_id ?? null,
          amount: Number(row.reward_amount) || 0,
        };
      }
      continue;
    }
    const key = summaryKey(row);
    const add = row.reward_kind === "pack" ? 1 : Number(row.reward_amount) || 0;
    summary[key] = (summary[key] ?? 0) + add;
    credited++;
  }
  return { credited, summary, warnings };
}
