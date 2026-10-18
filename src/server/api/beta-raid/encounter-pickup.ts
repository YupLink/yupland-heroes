// Подбор объекта без боя.
//
// Монетки на карте стоят с HP = 1: «бой» за них был чистой формальностью, но
// стоил игроку окна с отрядом, симуляции и полудюжины запросов к базе. Такие
// цели забираются одним нажатием: списали энергию, сняли HP, отдали награду.
import { getAccountId } from "../../accountBalances";
import { applyObjectDamage, logObjectRun, type ObjectHpRow } from "./encounter-hp";
import { grantEncounterRewards } from "./encounter-rewards";
import { publishRaid } from "../../raidLive";
import { noteCellsChanged } from "./map-change-hooks";
import { claimObjectPayout } from "./encounter-payout";
import type { EncounterTarget } from "./encounter-target";
import { RUNNER_LAYER } from "./runners";
import { revealRunnerAt, type RunnerReveal } from "./runner-reveal";
import { raidOwner } from "./owner";

/** Цель, у которой нечего выбивать: одного нажатия достаточно. */
/** Вернуть объект в прежнее состояние, если оплатить подбор не вышло. */
async function restoreObjectHp(hpId: string, dealt: number): Promise<void> {
  const { mcpExec } = await import("../../db/mcpClient");
  await mcpExec(
    `UPDATE yuplink.beta_raid_object_hp
        SET current_hp = LEAST(max_hp, current_hp + ${Math.max(0, Math.floor(dealt))}),
            killed_at = NULL, killed_by = NULL, updated_at = now()
      WHERE id = '${hpId}';`,
  );
}

export function isPickup(target: EncounterTarget, currentHp: number): boolean {
  return target.maxHp <= 1 && currentHp <= 1;
}

export async function pickupEncounter(opts: {
  wallet: string;
  target: EncounterTarget;
  hpRow: ObjectHpRow;
  mapId: string;
  q: number;
  r: number;
}) {
  const { wallet, target, hpRow, mapId, q, r } = opts;

  // Сначала забираем объект, и только потом списываем энергию. В обратном
  // порядке игрок платил за пустую клетку: сосед успевал раньше, приходило
  // «уже опустошён», а энергия не возвращалась.
  const commit = await applyObjectDamage({ hpId: hpRow.id, damage: hpRow.max_hp, wallet });
  if (!commit.killed && commit.dealt === 0) {
    throw new Error(`${target.badgeLabel} уже опустошён`);
  }

  const { sb } = await import("../../db/pg");
  const { error: enErr } = await sb.rpc("touch_energy_atomic", {
    p_wallet: wallet,
    p_spend: target.interactionCost,
  });
  if (enErr) {
    // Энергии не хватило — возвращаем объект на место, иначе он пропал бы
    // впустую: и награды нет, и клетка пустая.
    await restoreObjectHp(hpRow.id, commit.dealt).catch((e) =>
      console.warn("[beta-pickup] откат HP не удался:", e),
    );
    if (String(enErr.message).includes("not_enough_energy"))
      throw new Error(`Нужно ${target.interactionCost} энергии`);
    throw new Error(enErr.message);
  }
  const { noteEnergySpendByWallet } = await import("./econ/energy-note");
  void noteEnergySpendByWallet(wallet, target.interactionCost, "pickup");

  // Клетка опустела — карты у всех гасят её сразу, без ожидания опроса.
  // И тут же показываем того, кто под ней прятался: забрали укрытие — гриб
  // становится виден и доступен, а не исчезает вместе с ним.
  let reveal: RunnerReveal | null = null;
  if (commit.killed) {
    const wasRunner = Number(hpRow.cycle_no) === RUNNER_LAYER;
    reveal = wasRunner ? null : await revealRunnerAt(mapId, q, r).catch(() => null);
    publishRaid({
      mapId,
      type: "defeated",
      cells: [`${q},${r}`],
      runner: wasRunner,
      ...(reveal ? { reveal } : {}),
    });
    void noteCellsChanged(mapId, [`${q},${r}`]);
  }

  const accountId = await raidOwner(wallet);
  await logObjectRun({
    hpId: hpRow.id,
    objectId: target.templateId,
    wallet,
    accountId,
    damage: commit.dealt,
    rounds: 0,
    killed: commit.killed,
    generation: Number(hpRow.generation ?? 0) || 0,
  });

  // Награду выдаём только тому, кто реально опустошил объект, и только один
  // раз: два одновременных подбора не должны обернуться двумя наградами.
  const rewards =
    commit.killed && (await claimObjectPayout(hpRow.id, Number(hpRow.generation ?? 0) || 0))
      ? await grantEncounterRewards(wallet, target, { mapId, cycleNo: 0, q, r })
      : [];

  return {
    kind: target.kind,
    badgeLabel: target.badgeLabel,
    name: target.name,
    imageUrl: target.imageUrl,
    backgroundUrl: target.backgroundUrl,
    dealt: commit.dealt,
    killed: commit.killed,
    hpAfter: commit.hpAfter,
    maxHp: Number(hpRow.max_hp),
    rounds: 0,
    wiped: false,
    spentEnergy: target.interactionCost,
    burnedEnergy: 0,
    slowed: null,
    abilityLog: [],
    rewards,
    /** Кто открылся под забранным объектом (runner-reveal) — или ничего. */
    reveal,
    /** Подбор — окно боя показывать не нужно. */
    pickup: true,
  };
}
