// Сбор добычи слотов — одной записью: окно, лайки и состояние ложатся вместе.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ МОДУЛЬ. Замок окна раньше брался ОТДЕЛЬНЫМ запросом ДО
// начисления и при сбое оставался стоять. У player16.tg (29.08) он встал на
// окне 00:00Z, начисление не прошло — и все следующие попытки в этом
// четырёхчасовом окне получали «Уже собрано», хотя лайков никто не видел.
//
// Вторая половина той же мины — контракт ретрая mcpClient: повтор пишущего
// запроса уходит вслепую, а `ON CONFLICT ... DO UPDATE ... WHERE value IS
// DISTINCT FROM slot RETURNING key` на повторе отдаёт НОЛЬ строк (значение уже
// равно slot) — свой же успешный сбор код читал как чужой. Ровно та мина, что
// хоронила паки за введённые NFT (chips-mint-deposit-receipt.ts).
//
// ЛЕЧЕНИЕ. Три записи — пометка окна, лайки и новое состояние майнинга — уходят
// ОДНИМ SQL-запросом: Postgres применит их вместе или не применит вовсе. Окно
// физически не может быть занято без начисленных лайков. А в пометку кладём
// op_id этого вызова, поэтому повтор транспорта отличает свой коммит от чужого:
// ноль строк + наша метка в строке = «это уже сделали мы», а не «занято другим».
import { nanoid } from "nanoid";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";

/** `done` — окно взято этим вызовом (или его же повтором) и лайки начислены.
 *  `taken` — окно уже занято чужим сбором: ничего не записано. */
export type MiningCommit = { status: "done" | "taken" };

export type MiningCommitInput = {
  /** Канонический кошелёк аккаунта: буфер и состояние общие на все сестринские. */
  canon: string;
  nowMs: number;
  /** Длина окна сбора — она же кулдаун. */
  windowMs: number;
  /** Сколько лайков начислить. Строго больше нуля. */
  likes: number;
  /** Новое состояние майнинга целиком (JSON, как его пишет saveMiningState). */
  stateJson: string;
};

export function miningLockKey(canon: string): string {
  return `mining-claim:${canon}`;
}

/** Пометка окна: `{номер окна}:{op_id этого вызова}`. */
function miningMark(o: MiningCommitInput): string {
  return `${Math.floor(o.nowMs / o.windowMs)}:mcl_${nanoid(12)}`;
}

/**
 * Текст запроса вынесен в отдельную функцию: проверить поведение на повторе
 * можно, только прогнав ТОТ ЖЕ SQL с ТОЙ ЖЕ пометкой (разовым скриптом) —
 * копия запроса проверяла бы копию, а не то, что уходит в прод.
 *
 * `paid` и `saved` читают вывод `won`, поэтому без взятого окна не выполняются
 * вовсе. Старый формат пометки (голый номер окна, без `:`) считается
 * несуществующим: такие оставила прежняя версия, и застрявшие на них игроки
 * расклиниваются сами.
 */
export function miningCommitSql(o: MiningCommitInput, mark: string): string {
  const slot = String(Math.floor(o.nowMs / o.windowMs));
  const lockKey = miningLockKey(o.canon);
  const amt = Number(o.likes).toFixed(4);
  return `WITH won AS (
       INSERT INTO yuplink.settings AS s (key, value)
       VALUES (${sqlStr(lockKey)}, ${sqlStr(mark)})
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        WHERE split_part(s.value, ':', 2) = ''
           OR split_part(s.value, ':', 1) IS DISTINCT FROM ${sqlStr(slot)}
       RETURNING s.key AS key
     ), paid AS (
       INSERT INTO yuplink.user_like_balance
         (account_id, available, last_daily_grant_at,
          lifetime_granted, lifetime_purchased, lifetime_spent, updated_at)
       SELECT yuplink.acc_of(${sqlStr(o.canon)}), ${amt}, NULL, ${amt}, 0, 0, now() FROM won
       ON CONFLICT (account_id) DO UPDATE
          SET available = yuplink.user_like_balance.available + EXCLUDED.available,
              lifetime_granted = yuplink.user_like_balance.lifetime_granted
                                 + EXCLUDED.lifetime_granted,
              updated_at = now()
       RETURNING account_id
     ), saved AS (
       INSERT INTO yuplink.settings (key, value)
       SELECT ${sqlStr(`mining:${o.canon}`)}, ${sqlStr(o.stateJson)} FROM won
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
       RETURNING key
     )
     SELECT (SELECT count(*) FROM won)::int AS won,
            (SELECT count(*) FROM paid)::int AS paid,
            (SELECT count(*) FROM saved)::int AS saved;`;
}

/**
 * Начисляет добытые лайки и фиксирует состояние — вместе с пометкой окна.
 * Всё тремя записями в одном запросе: «окно занято, а лайков нет» больше
 * не собирается.
 */
export async function commitMiningClaim(o: MiningCommitInput): Promise<MiningCommit> {
  if (!(Number.isFinite(Number(o.likes)) && Number(o.likes) > 0)) {
    throw new Error("commitMiningClaim: начисление должно быть больше нуля");
  }
  const mark = miningMark(o);
  const rows = (await mcpExec(miningCommitSql(o, mark))) as Array<{
    won?: number;
  }> | null;
  if (Number(rows?.[0]?.won ?? 0) > 0) return { status: "done" };

  // Ноль строк говорит две разные вещи: окно занял кто-то другой ИЛИ транспорт
  // повторил наш же коммит вслепую. Отвечает метка — она наша или чужая.
  return (await miningLockHolder(o.canon)) === mark
    ? { status: "done" }
    : { status: "taken" };
}

/** Чья сейчас пометка окна. Пусто — свободно. */
export async function miningLockHolder(canon: string): Promise<string> {
  const rows = (await mcpExec(
    `SELECT value FROM yuplink.settings WHERE key = ${sqlStr(miningLockKey(canon))} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ value?: string }> | null;
  return rows?.[0]?.value ?? "";
}
