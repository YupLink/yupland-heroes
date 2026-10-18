// Счёт энергии, потраченной на перемещение по клеткам.
//
// Хранится в beta_raid_positions.energy_spent_move: одна строка на аккаунт,
// поэтому не нужен отдельный ledger. Счёт нужен для гейта порталов и дверей:
// «пройди N энергии — тогда пропустим».
//
// Считаем только шаги (не тратим на порталы, посадку, бой), с ИТОГОВОЙ цены
// после всех скидок — как её списал touch_energy_atomic.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { raidOwner } from "./owner";

export async function moveEnergySpent(wallet: string): Promise<number> {
  const acc = sqlStr(await raidOwner(wallet));
  const rows = (await mcpExec(
    `SELECT energy_spent_move FROM yuplink.beta_raid_positions
      WHERE account_id = ${acc} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ energy_spent_move: number }>;
  return Number(rows?.[0]?.energy_spent_move) || 0;
}

export async function bumpMoveEnergy(wallet: string, delta: number): Promise<void> {
  if (!(delta > 0)) return;
  const acc = sqlStr(await raidOwner(wallet));
  await mcpExec(
    `UPDATE yuplink.beta_raid_positions
        SET energy_spent_move = COALESCE(energy_spent_move, 0) + ${Number(delta)}
      WHERE account_id = ${acc};`,
  );
}
