// Ключ нажатия «снять героя с грядки издалека»: занять и отпустить.
//
// Живёт в журнале операций поля (raid_field_op) рядом с ключами сбора урожая и
// склада: отдельная таблица ради одной кнопки не нужна. Ключ `rcl:<акк>:<op>` —
// само нажатие, `lv:rcl:<акк>:<op>` — удачное снятие (его пишет field-leave).
// Аккаунт в ключе обязателен (ПРАВИЛА 13б): op присылает клиент, и чужой op не
// должен занять моё нажатие.
//
// Почему метка, а не `ON CONFLICT DO NOTHING RETURNING`: мост к базе повторяет
// запись вслепую (mcpClient, «КОНТРАКТ РЕТРАЯ»). Первая попытка вставила строку,
// ответ потерялся, повтор упёрся в свою же строку и отдал ноль — нажатие молча
// пропало бы. Поэтому в units кладём СВОЮ метку вызова и `DO UPDATE SET units =
// <прежнее>`: RETURNING отдаёт строку всегда, и по метке видно, чья она (тот же
// приём, что claimBoostOp). Повтор моста шлёт тот же SQL с той же меткой и
// узнаёт себя; второй запрос с тем же op приходит со своей меткой и видит чужую.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

/** Ключ нажатия; он же — ключ снятия, которым снятие издалека пишет свой успех. */
export const recallKey = (account: string, op: string): string => `rcl:${account}:${op}`;

/** Метка вызова: целое из 15 цифр — numeric хранит его точно, без дробей. */
export function newRecallMark(): number {
  return 100_000_000_000_000 + Math.floor(Math.random() * 899_999_999_999_999);
}

/** Занять ключ нажатия. false — его уже занял другой запрос с тем же op. */
export async function claimRecallOp(key: string, mark: number): Promise<boolean> {
  const rows = (await mcpExec(
    `INSERT INTO yuplink.raid_field_op AS o (op, units)
     VALUES (${sqlStr(key)}, ${mark})
     ON CONFLICT (op) DO UPDATE SET units = o.units
     RETURNING o.units::text AS mark;`,
    { wrapJsonCte: true },
  )) as Array<{ mark: string | null }>;
  return rows?.[0]?.mark === String(mark);
}

/** Отпустить ключ: снятия не было, повтор того же нажатия вправе пройти заново. */
export async function releaseRecallOp(key: string, mark: number): Promise<void> {
  await mcpExec(
    `DELETE FROM yuplink.raid_field_op WHERE op = ${sqlStr(key)} AND units = ${mark};`,
  ).catch((e) => console.warn("[field-recall] ключ нажатия не отпущен:", key, e));
}
