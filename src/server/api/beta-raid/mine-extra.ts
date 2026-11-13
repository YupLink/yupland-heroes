// Шахта в окне постройки: что добывает, чья сейчас, сколько накопилось.
// Вынесено из building-extra.ts без изменения логики — тот держится в лимите
// ≤250 строк и зовёт mineExtra() отсюда.
//
// Шахты v2 (§8.59) отдают ещё поле v2: режим, запас службы, поломка и цена
// починки (тип MineV2View в lib/mineExtra.ts) и serverNow — часы сервера снимка,
// по ним окно поправляет часы телефона (lib/mineV2Clock). Для них секундомер, выход и
// предел часов уже подставлены так, что живой расчёт livePendingAmount у
// клиента даёт добычу v2 (lib/mineV2Row.ts). Сломанная или ничья v2 —
// v2.broken: true, захвата нет (только починка). Цена захвата — с множителем
// энергии карты (остров новичка — в 10 раз меньше), как и списывает mine-capture.
// Запас чужой шахты дальше «второго обзора» героя спрятан (mine-life-see.ts).
// Замок шахтёра (§8.123): остаток видят все (захватчик — замок вместо кнопки),
// цену постановки — хозяин, чей выбранный герой Шахтёр.
import type { BuildingExtra } from "@/lib/buildingEffect";
import { energyMultOf, scaleEnergy } from "@/lib/raid/island/energy";
import { loadMineCell } from "./mine-v2-read";
import { hideMineLife, mineHpInSight } from "./mine-life-see";
import { MUSHROOM_ENERGY } from "@/lib/daraiMine";
import { mushroomKindOf } from "@/lib/mushroomKinds";

/**
 * Шахта: что добывает, чья сейчас, сколько накопилось — для окна покупателя.
 * Открыта всем игрокам (захват/добыча); настройку правит только админ.
 */
export async function mineExtra(opts: {
  built: boolean;
  wallet: string;
  mapId: string;
  q: number;
  r: number;
  meta?: unknown;
  cellConfig?: unknown;
}): Promise<BuildingExtra> {
  const { built, wallet, mapId, q, r } = opts;
  // Шахта открыта всем игрокам: захват/добыча доступны любому (настройка — админ).
  const { cellMineConfig } = await import("@/lib/mineConfig");
  const cfg = cellMineConfig(opts.cellConfig, opts.meta);
  if (!cfg) {
    return {
      kind: "mine",
      resource: "gold",
      token: null,
      yieldAmount: 0,
      captureCost: 0,
      mine: "free",
      capturedAt: null,
      claimedHours: 0,
      pending: 0,
      guardian: null,
      v2: null,
      can: false,
      reasonKey: built ? "braid.mine_not_set" : "braid.mine_not_grown",
    };
  }
  // Пендинг-модель без крона: секундомер (captured_at) + claimed_hours отдаём
  // клиенту, он сам считает часы. pending — снимок на момент ответа.
  const st = await loadMineCell(mapId, q, r);
  const { accAccountId } = await import("../currency/move");
  const myAcc = await accAccountId(wallet).catch(() => null);
  const mine: "own" | "enemy" | "free" = !st.owner ? "free" : st.owner === myAcc ? "own" : "enemy";
  // Живой охранник: чужому/свободную не захватить, пока не победит его.
  const { loadGuardRow, guardViewIfAlive } = await import("./mine-guard");
  const guardian = guardViewIfAlive(await loadGuardRow(mapId, q, r));
  const guarded = !!guardian;
  const broken = st.view?.broken === true;
  // Гриб любого вида (lib/mushroomKinds): «Забрать» вместо захвата, цена —
  // MUSHROOM_ENERGY. Поднимал его последним я — снова, когда поднимет и посадит
  // другой (raid_dmine_take: dmine_once); кнопку «Забрать» выключаем с причиной.
  // Созревание (защита на час, lib/mushroomRipe) — видно всем, отказ — от сервера.
  const mushroom = mushroomKindOf(opts.cellConfig);
  const { dmineCellRow } = await import("./dmine/dmine-last-taker");
  const dm = mushroom ? await dmineCellRow(mapId, q, r) : null;
  const once = !!myAcc && !!dm && dm.takenBy === myAcc;
  // Своя шахта v2 мира: улучшать может только Строитель (§8.74) — кнопке нужна причина.
  let v2 = st.view;
  if (v2 && mine === "own" && !v2.island && !broken) {
    const { resolveBackpack } = await import("./market-backpack");
    const { BUILDER_SPEC } = await import("@/lib/buildingEffect");
    const bag = await resolveBackpack(wallet).catch(() => null);
    v2 = { ...v2, builder: bag?.spec === BUILDER_SPEC };
  }
  const { mineWardLeft } = await import("./mine-ward/mine-ward-read");
  const wardLeftMs = mushroom || broken ? 0 : await mineWardLeft(mapId, q, r).catch(() => 0);
  let wardEnergy: number | null = null;
  if (mine === "own" && !mushroom && !broken) {
    const { loadSelectedHero } = await import("./hero-load");
    const { MINER_ABILITY, MINE_WARD_ENERGY } = await import("@/lib/mineWard");
    const hero = await loadSelectedHero(wallet).catch(() => null);
    if (hero?.ability === MINER_ABILITY)
      wardEnergy = scaleEnergy(MINE_WARD_ENERGY, energyMultOf(mapId));
  }
  // Чужой запас — только во «втором обзоре» (владелец, 04.11.2026): вдали не отдаём.
  if (v2 && mine === "enemy" && !(await mineHpInSight(wallet, mapId, q, r))) v2 = hideMineLife(v2);
  return {
    kind: "mine",
    resource: cfg.resource,
    token: cfg.token,
    yieldAmount: st.live?.yield ?? cfg.yield,
    mushroom,
    ripeAt: dm?.ripeAt ?? null,
    captureCost: mushroom ? MUSHROOM_ENERGY : scaleEnergy(cfg.captureCost, energyMultOf(mapId)),
    mine,
    capturedAt: st.capturedAt,
    claimedHours: st.claimedHours,
    maxHours: st.live ? st.live.maxHours : (cfg.maxHours ?? null),
    pending: mine === "own" ? st.pending : 0,
    guardian,
    v2,
    wardLeftMs,
    wardEnergy,
    // Сломанную/ничью v2 боем не берут — только починкой (окно v2).
    can: built && mine !== "own" && !guarded && !broken && !once,
    reasonKey: !built
      ? "braid.mine_not_grown"
      : mine === "own"
        ? "braid.mine_yours"
        : broken
          ? "braid.mine_broken"
          : guarded
            ? "braid.mine_guarded"
            : once
              ? "dmine.once"
              : null,
  };
}
