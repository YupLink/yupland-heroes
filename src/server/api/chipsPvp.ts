// PvP-бои фишек. Маппинг наших звёздочных уровней (1..5 с шагом 0.5) на
// диапазоны силы CapsGame:
//   1.0 → 1-12      (Common)
//   1.5 → 6-17      (Common+)
//   2.0 → 15-26     (Rare)
//   2.5 → 24-35     (Rare+)
//   3.0 → 36-47     (Epic)
//   3.5 → 48-59     (Epic+)
//   4.0 → 63-74     (Legend)
//   4.5 → 78-89     (Legend+)
//   5.0 → 102-113   (Diamond)
//
// На create: фишки создателя залочены (status='locked').
// На join: соперник присылает СТОЛЬКО ЖЕ фишек, и multiset уровней
// должен совпадать. После этого сразу резолв: пары формируются по убыванию
// уровня (сильный против сильного), для каждой пары случайная сила
// в диапазоне, выигравшая фишка пары забирает проигравшую — wallet
// в user_chip_inventory меняется на победителя пары.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg, sb } from "../db/pg";
import type { PgChipPvpBattle } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { getSisterWallets } from "./user";
import { CHIP_REST_MS, isChipResting } from "../chipRest";
import { accountOf } from "./user-shared";
import { requirePvpEnabled } from "./chipsPvpSwitch";
import { walletLabel } from "@/server/api/player-name/player-name-labels";
import { secureRandomInt } from "@/lib/secureRandom";

// PvP открыт всем подключённым кошелькам. Требуется только наличие
// активной сессии (wallet). Раньше тут стоял admin-only gate.
function requireWallet(): string {
  const w = getCurrentWallet();
  if (!w) throw new Error("Кошелёк не подключён");
  assertNotMaintenance(w);
  return w;
}

// Диапазоны силы по уровню звезды.
const POWER_RANGES: Record<string, [number, number]> = {
  "1": [1, 12],
  "1.5": [6, 17],
  "2": [15, 26],
  "2.5": [24, 35],
  "3": [36, 47],
  "3.5": [48, 59],
  "4": [63, 74],
  "4.5": [78, 89],
  "5": [102, 113],
};

function powerRange(level: number): [number, number] {
  const key = String(level);
  return POWER_RANGES[key] ?? [1, 12];
}
function rollPower(level: number): number {
  const [lo, hi] = powerRange(level);
  return secureRandomInt(lo, hi + 1);
}

// Утилита для UI: вернуть карту уровень → [min, max].
export const getChipPvpPowerTable = createServerFn({ method: "GET" }).handler(
  async () => {
    return Object.entries(POWER_RANGES).map(([level, [min, max]]) => ({
      level: Number(level),
      min,
      max,
    }));
  }
);

/**
 * Создать вызов: лочим фишки создателя.
 */
export const createPvpBattle = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        chipIds: z.array(z.string().min(1)).min(1).max(10),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    await requirePvpEnabled();
    // Уникальные id.
    const ids = Array.from(new Set(data.chipIds));
    if (ids.length === 0) throw new Error("Фишки не выбраны");

    // Проверяем что все фишки принадлежат игроку и owned.
    const myAccount = await accountOf(wallet);
    const chips = await Promise.all(
      ids.map((id) => pg.userChipInventory.findOne({ id }))
    );
    for (const c of chips) {
      if (!c) throw new Error("Фишка не найдена");
      if (c.account_id !== myAccount) throw new Error("Можно ставить только свои фишки");
      if (c.status !== "owned")
        throw new Error(`Фишка ${c.id} занята (status=${c.status})`);
      if (isChipResting(c.rest_until))
        throw new Error("Фишка отдыхает после передачи — в PvP можно через час");
    }

    const battleId = `pvp_${nanoid(10)}`;
    const now = new Date().toISOString();

    // Лочим фишки CAS-ом (owned→locked) — атомарно, чтобы одну фишку нельзя
    // было параллельно поставить в PvP И выставить на маркет (двойной спенд).
    // Если фишка уже занята — откатываем уже залоченные и падаем.
    const lockedIds: string[] = [];
    for (const c of chips) {
      const { data: lk, error: lkErr } = await sb
        .from("user_chip_inventory")
        .update({ status: "locked", updated_at: now })
        .eq("id", c!.id)
        .eq("status", "owned")
        .select("id");
      if (lkErr || !lk || lk.length === 0) {
        if (lockedIds.length > 0)
          await sb
            .from("user_chip_inventory")
            .update({ status: "owned", updated_at: now })
            .in("id", lockedIds);
        throw new Error("Одна из фишек уже занята (гонка) — попробуй ещё раз");
      }
      lockedIds.push(c!.id);
    }

    const row: PgChipPvpBattle = {
      id: battleId,
      creator_account: await accountOf(wallet),
      opponent_account: null,
      creator_wallet: wallet,
      creator_chip_ids: ids,
      opponent_wallet: null,
      opponent_chip_ids: null,
      status: "open",
      pairs: null,
      created_at: now,
      resolved_at: null,
    };
    await pg.chipPvpBattles.insert(row);
    return { ok: true, battleId };
  });

/**
 * Отозвать свой вызов (если ещё никто не присоединился).
 */
export const cancelPvpBattle = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ battleId: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const b = await pg.chipPvpBattles.findOne({ id: data.battleId });
    if (!b) throw new Error("Бой не найден");
    // Бой принадлежит аккаунту: отменит его тот же игрок, каким бы адресом ни
    // вошёл. Раньше сравнивали адреса, и после смены коша фишки застревали.
    const account = await accountOf(wallet);
    if (b.creator_account !== account) throw new Error("Не твой бой");
    if (b.status !== "open") throw new Error("Бой уже закрыт");

    const now = new Date().toISOString();
    // Разлочиваем фишки создателя.
    for (const id of b.creator_chip_ids) {
      await pg.userChipInventory.update(
        { id },
        { status: "owned", updated_at: now }
      );
    }
    await pg.chipPvpBattles.update(
      { id: b.id },
      { status: "cancelled", resolved_at: now }
    );
    return { ok: true };
  });

/**
 * Список открытых вызовов (не свои, status='open'), с информацией
 * о уровнях фишек создателя — чтобы соперник видел чем подбирать.
 */
// Утилита: вытянуть детали фишек для отображения карточки (image+уровень+тайтл).
async function fetchChipsForDisplay(chipIds: string[]) {
  if (chipIds.length === 0) return [];
  const chips = await Promise.all(
    chipIds.map((id) => pg.userChipInventory.findOne({ id }))
  );
  const ok = chips.filter((c): c is NonNullable<typeof c> => c != null);
  const tplIds = Array.from(new Set(ok.map((c) => c.template_id)));
  const tpls = await Promise.all(
    tplIds.map((id) => pg.chipTemplates.findOne({ id }))
  );
  const tplMap = new Map(
    tpls.filter((t): t is NonNullable<typeof t> => t != null).map((t) => [t.id, t])
  );
  return ok.map((c) => {
    const t = tplMap.get(c.template_id);
    return {
      id: c.id,
      level: c.level,
      imageUrl: t?.image_url ?? null,
      templateNo: t?.template_no ?? null,
      name: t?.name ?? "",
    };
  });
}

/** Подпись игрока: своё имя из профиля или «@ник» (player-name); нет — null. */
async function fetchUsername(wallet: string): Promise<string | null> {
  return walletLabel(wallet);
}

export const listOpenPvpBattles = createServerFn({ method: "GET" }).handler(
  async () => {
    const me = requireWallet();
    // isMine — по всему аккаунту: бой мог быть создан с сестры; иначе после
    // переключения коша владелец не увидит кнопку отмены и фишки застрянут locked.
    const myAccount = await accountOf(me);
    const rows = await pg.chipPvpBattles.findMany(
      { status: "open" },
      { orderBy: { column: "created_at", ascending: false }, limit: 50 }
    );
    const result = [];
    for (const b of rows) {
      const chips = await fetchChipsForDisplay(b.creator_chip_ids);
      // Сортируем фишки по уровню — повыше левее (как в CapsGame).
      chips.sort((a, b) => b.level - a.level);
      result.push({
        id: b.id,
        creatorWallet: b.creator_wallet,
        creatorUsername: await fetchUsername(b.creator_wallet),
        chips,
        chipCount: b.creator_chip_ids.length,
        isMine: b.creator_account === myAccount,
        createdAt: b.created_at,
      });
    }
    return result;
  }
);

/**
 * Мои бои (created или participated) — последние 20.
 */
export const listMyPvpBattles = createServerFn({ method: "GET" }).handler(
  async () => {
    const wallet = requireWallet();
    // По всему аккаунту: бои, созданные/принятые с любой сестры, видны из любого коша.
    const account = await accountOf(wallet);
    const { data: mineAsCreator } = await pg.chipPvpBattles
      .raw()
      .select("*")
      .eq("creator_account", account)
      .order("created_at", { ascending: false })
      .limit(20);
    const { data: mineAsOpponent } = await pg.chipPvpBattles
      .raw()
      .select("*")
      .eq("opponent_account", account)
      .order("created_at", { ascending: false })
      .limit(20);
    const all = [
      ...((mineAsCreator ?? []) as PgChipPvpBattle[]),
      ...((mineAsOpponent ?? []) as PgChipPvpBattle[]),
    ];
    // Дедуп по id, сорт по дате.
    const seen = new Set<string>();
    const dedup = [];
    for (const b of all) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      dedup.push(b);
    }
    dedup.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    // Доп. инфа для UI: чипы + username соперников.
    const out = [];
    for (const b of dedup.slice(0, 30)) {
      const creatorChips = await fetchChipsForDisplay(b.creator_chip_ids);
      const opponentChips = b.opponent_chip_ids
        ? await fetchChipsForDisplay(b.opponent_chip_ids)
        : [];
      creatorChips.sort((a, c) => c.level - a.level);
      opponentChips.sort((a, c) => c.level - a.level);
      out.push({
        id: b.id,
        creatorWallet: b.creator_wallet,
        creatorUsername: await fetchUsername(b.creator_wallet),
        creatorChips,
        opponentWallet: b.opponent_wallet,
        opponentUsername: b.opponent_wallet
          ? await fetchUsername(b.opponent_wallet)
          : null,
        opponentChips,
        status: b.status,
        pairs: b.pairs,
        iAmCreator: b.creator_account === account,
        createdAt: b.created_at,
        resolvedAt: b.resolved_at,
      });
    }
    return out;
  }
);

/**
 * Принять вызов. Multiset уровней должен совпадать со ставкой создателя.
 * Резолв немедленно: пары по убыванию уровня (сильный vs сильный), на
 * каждом уровне — рандомное парное распределение. Победитель пары
 * забирает обе фишки (своя + соперника).
 */
export const joinPvpBattle = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        battleId: z.string().min(1),
        chipIds: z.array(z.string().min(1)).min(1).max(10),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    await requirePvpEnabled();
    const account = await accountOf(wallet);
    const b = await pg.chipPvpBattles.findOne({ id: data.battleId });
    if (!b) throw new Error("Бой не найден");
    if (b.status !== "open") throw new Error("Бой уже закрыт");
    // Нельзя принять свой бой: раньше сравнивали со списком адресов, теперь с
    // аккаунтом — «отмыть» фишку через второй кошелёк по-прежнему нельзя.
    if ((await accountOf(b.creator_wallet)) === account)
      throw new Error("Нельзя принять свой бой");

    const ids = Array.from(new Set(data.chipIds));
    if (ids.length !== b.creator_chip_ids.length)
      throw new Error(
        `Нужно ${b.creator_chip_ids.length} фишк${b.creator_chip_ids.length === 1 ? "у" : "и"}`
      );

    // Проверка владения и статуса.
    const oppChips = [];
    for (const id of ids) {
      const c = await pg.userChipInventory.findOne({ id });
      if (!c) throw new Error("Фишка не найдена");
      if (c.account_id !== account) throw new Error("Не твоя фишка");
      if (c.status !== "owned") throw new Error("Фишка занята");
      if (isChipResting(c.rest_until))
        throw new Error("Фишка отдыхает после передачи — в PvP можно через час");
      oppChips.push(c);
    }
    const creatorChips = [];
    for (const id of b.creator_chip_ids) {
      const c = await pg.userChipInventory.findOne({ id });
      if (!c) throw new Error("Битва повреждена: фишка создателя пропала");
      creatorChips.push(c);
    }

    // Проверка multiset-уровней.
    const lvlSort = (a: number, c: number) => a - c;
    const oppLvls = oppChips.map((c) => c.level).sort(lvlSort);
    const creLvls = creatorChips.map((c) => c.level).sort(lvlSort);
    if (oppLvls.join(",") !== creLvls.join(","))
      throw new Error("Состав уровней не совпадает со ставкой соперника");

    // Пары: сортируем обе стороны по уровню desc. На одинаковом уровне
    // CapsGame делает РАНДОМНЫЕ пары — перемешиваем фишки одного уровня.
    function groupAndShuffle<T extends { level: number }>(arr: T[]): T[] {
      const byLvl = new Map<number, T[]>();
      for (const x of arr) {
        const list = byLvl.get(x.level) ?? [];
        list.push(x);
        byLvl.set(x.level, list);
      }
      const out: T[] = [];
      const levels = [...byLvl.keys()].sort((a, c) => c - a);
      for (const lvl of levels) {
        const list = byLvl.get(lvl)!;
        // Fisher-Yates
        for (let i = list.length - 1; i > 0; i--) {
          const j = secureRandomInt(0, i + 1);
          [list[i], list[j]] = [list[j], list[i]];
        }
        out.push(...list);
      }
      return out;
    }
    const sideCreator = groupAndShuffle(creatorChips);
    const sideOpponent = groupAndShuffle(oppChips);

    const now = new Date().toISOString();
    const pairs: NonNullable<PgChipPvpBattle["pairs"]> = [];
    for (let i = 0; i < sideCreator.length; i++) {
      const c = sideCreator[i];
      const o = sideOpponent[i];
      const cStr = rollPower(c.level);
      const oStr = rollPower(o.level);
      const winnerSide =
        cStr > oStr ? "creator" : cStr < oStr ? "opponent" : "draw";

      // Передача проигравшей фишки победителю пары.
      // На draw — никто не забирает, обе возвращаются хозяевам.
      if (winnerSide === "creator") {
        // Проигравшая o → переходит к creator. Анти-карусель: выигранная фишка
        // приходит НА ЧАС ОТДЫХА (нельзя сразу в бой/крафт/продажу).
        await pg.userChipInventory.update(
          { id: o.id },
          {
            account_id: b.creator_account,
            wallet: b.creator_wallet,
            status: "owned",
            updated_at: now,
            rest_until: new Date(Date.now() + CHIP_REST_MS).toISOString(),
          }
        );
        // Своя creator — разлочиваем (не передача, отдых не ставим).
        await pg.userChipInventory.update(
          { id: c.id },
          { status: "owned", updated_at: now }
        );
      } else if (winnerSide === "opponent") {
        // Проигравшая c → переходит к opponent (тоже на час отдыха).
        await pg.userChipInventory.update(
          { id: c.id },
          {
            account_id: account,
            wallet,
            status: "owned",
            updated_at: now,
            rest_until: new Date(Date.now() + CHIP_REST_MS).toISOString(),
          }
        );
        // Своя opponent — оставляем себе, ничего не меняем (она всё равно
        // не лочилась — мы её только проверили).
        // (но на всякий случай updated_at)
        await pg.userChipInventory.update(
          { id: o.id },
          { updated_at: now }
        );
      } else {
        // draw — обе возвращаются хозяевам.
        await pg.userChipInventory.update(
          { id: c.id },
          { status: "owned", updated_at: now }
        );
        await pg.userChipInventory.update(
          { id: o.id },
          { updated_at: now }
        );
      }
      pairs.push({
        creatorChipId: c.id,
        opponentChipId: o.id,
        creatorStr: cStr,
        opponentStr: oStr,
        winnerSide,
      });
    }

    await pg.chipPvpBattles.update(
      { id: b.id },
      {
        opponent_account: account,
        opponent_wallet: wallet,
        opponent_chip_ids: ids,
        status: "done",
        pairs,
        resolved_at: now,
      }
    );

    // Обогащаем pairs деталями фишек для UI (картинка, звезды, имя).
    const allChipIds = [
      ...creatorChips.map((c) => c.id),
      ...oppChips.map((c) => c.id),
    ];
    const allDisplay = await fetchChipsForDisplay(allChipIds);
    const displayMap = new Map(allDisplay.map((d) => [d.id, d]));
    const enrichedPairs = pairs.map((p) => ({
      ...p,
      creatorChip: displayMap.get(p.creatorChipId) ?? null,
      opponentChip: displayMap.get(p.opponentChipId) ?? null,
    }));

    return { ok: true, battleId: b.id, pairs: enrichedPairs };
  });
