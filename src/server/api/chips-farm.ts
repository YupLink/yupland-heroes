// chips-farm — collection farms (ticket farming from completed collections).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { requireWallet } from "./chips-mint-helpers";
import { fmtRemain } from "./chips-utils";
import { actionGate } from "../rateGate";
import { accountOf } from "./user-shared";

const COLLECTION_FARM_COOLDOWN_MS = 6 * 60 * 60 * 1000;
// Потолка копилки нет (владелец, 16.10.2026: «в музее не должно быть ограничения в 3 дня —
// просто копятся билеты»): сколько суток не собирал — столько и копится.

type CollFarmEntry = {
  lastClaimAtMs: number;
  totalClaimed: number;
  completeSinceMs?: number;
  lastRate?: number;
};
type CollFarmState = {
  collections: Record<string, CollFarmEntry>;
};

/**
 * Ключ состояния фарма — аккаунт. Прежний «канонический кошелёк ТГ-группы»
 * менялся при отвязке адреса, и накопленное фермером просто исчезало; у
 * игрока без кошелька такого ключа не было вовсе.
 */
async function canonicalWallet(wallet: string): Promise<string> {
  const { accountOf } = await import("./user-shared");
  return accountOf(wallet);
}

function rateForMinLevel(minLevel: number): number {
  if (minLevel >= 5) return 1.0;
  if (minLevel >= 4) return 0.5;
  if (minLevel >= 3) return 0.1;
  return 0;
}

function resolveFarmAccrual(
  entry: CollFarmEntry,
  rate: number,
  now: number,
): { accrued: number; changed: boolean } {
  let changed = false;
  if (rate <= 0) {
    if (entry.completeSinceMs) {
      entry.completeSinceMs = 0;
      entry.lastRate = 0;
      changed = true;
    }
    return { accrued: 0, changed };
  }
  if (!entry.completeSinceMs || entry.lastRate !== rate) {
    entry.completeSinceMs = now;
    entry.lastRate = rate;
    changed = true;
  }
  const base = Math.max(entry.lastClaimAtMs || 0, entry.completeSinceMs);
  const sinceMs = Math.max(0, now - base);
  return { accrued: (sinceMs / 86_400_000) * rate, changed };
}

async function getCollFarmState(wallet: string): Promise<CollFarmState> {
  const canon = await canonicalWallet(wallet);
  const row = await pg.settings.findOne({ key: `collfarm:${canon}` });
  if (!row?.value) return { collections: {} };
  try {
    const st = JSON.parse(row.value) as Partial<CollFarmState>;
    return { collections: st.collections ?? {} };
  } catch {
    return { collections: {} };
  }
}

async function saveCollFarmState(wallet: string, st: CollFarmState): Promise<void> {
  const canon = await canonicalWallet(wallet);
  await pg.settings.upsert(
    { key: `collfarm:${canon}`, value: JSON.stringify(st) },
    { onConflict: "key" },
  );
}

async function getMinLevelForCollection(
  wallet: string,
  collectionId: string,
): Promise<{
  minLevel: number;
  templateCount: number;
  perTemplate: Array<{ templateId: string; bestLevel: number }>;
}> {
  const { data: tplData } = await pg.chipTemplates
    .raw()
    .select("id")
    .eq("collection_id", collectionId);
  const tplIds = ((tplData ?? []) as Array<{ id: string }>).map((t) => t.id);
  if (tplIds.length === 0) return { minLevel: 0, templateCount: 0, perTemplate: [] };
  const { getSisterWallets } = await import("./user");
  const account = await accountOf(wallet);
  const { data: chipData } = await pg.userChipInventory
    .raw()
    .select("template_id,level")
    .eq("account_id", account)
    .in("status", ["owned", "staked"])
    .in("template_id", tplIds);
  const bestByTpl = new Map<string, number>();
  for (const c of (chipData ?? []) as Array<{ template_id: string; level: number }>) {
    const cur = bestByTpl.get(c.template_id) ?? 0;
    if (c.level > cur) bestByTpl.set(c.template_id, c.level);
  }
  const perTemplate = tplIds.map((id) => ({ templateId: id, bestLevel: bestByTpl.get(id) ?? 0 }));
  const minLevel = perTemplate.length ? Math.min(...perTemplate.map((p) => p.bestLevel)) : 0;
  return { minLevel, templateCount: tplIds.length, perTemplate };
}

export const getMyCollectionFarms = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return [];
  const st = await getCollFarmState(wallet);
  const { data: collData } = await pg.chipCollections
    .raw()
    .select("id,name,cover_image_url")
    .order("created_at", { ascending: true });
  const collections = (collData ?? []) as Array<{
    id: string;
    name: string;
    cover_image_url: string | null;
  }>;
  const now = Date.now();
  let dirty = false;
  const out = [];

  const { getSisterWallets } = await import("./user");
  const collIds = collections.map((c) => c.id);
  const account = await accountOf(wallet);
  const [tplRes, chipRes] = await Promise.all([
    pg.chipTemplates.raw().select("id,collection_id").in("collection_id", collIds),
    // 'staked' — фишка учится в университете: она физически У ИГРОКА, и в
    // счёт коллекции обязана попадать (иначе положил фишку — и коллекция
    // «развалилась», клеймить нечего). См. sibling: chips-stake-farm тем же
    // фильтром показывает учащихся серыми в списке экземпляров шаблона.
    pg.userChipInventory
      .raw()
      .select("template_id,level")
      .eq("account_id", account)
      .in("status", ["owned", "staked"]),
  ]);
  const tplByColl = new Map<string, string[]>();
  for (const t of (tplRes.data ?? []) as Array<{ id: string; collection_id: string }>) {
    const a = tplByColl.get(t.collection_id) ?? [];
    a.push(t.id);
    tplByColl.set(t.collection_id, a);
  }
  const bestByTpl = new Map<string, number>();
  for (const c of (chipRes.data ?? []) as Array<{ template_id: string; level: number }>) {
    const curv = bestByTpl.get(c.template_id) ?? 0;
    if (c.level > curv) bestByTpl.set(c.template_id, c.level);
  }
  const infoOf = (collId: string) => {
    const tplIds = tplByColl.get(collId) ?? [];
    if (tplIds.length === 0)
      return {
        minLevel: 0,
        templateCount: 0,
        perTemplate: [] as Array<{ templateId: string; bestLevel: number }>,
      };
    const perTemplate = tplIds.map((id) => ({ templateId: id, bestLevel: bestByTpl.get(id) ?? 0 }));
    return {
      minLevel: perTemplate.length ? Math.min(...perTemplate.map((p) => p.bestLevel)) : 0,
      templateCount: tplIds.length,
      perTemplate,
    };
  };

  for (const c of collections) {
    const info = infoOf(c.id);
    const rate = rateForMinLevel(info.minLevel);
    const entry = st.collections[c.id] ?? { lastClaimAtMs: 0, totalClaimed: 0 };
    const { accrued, changed } = resolveFarmAccrual(entry, rate, now);
    if (changed) {
      st.collections[c.id] = entry;
      dirty = true;
    }
    const sinceClaimMs = entry.lastClaimAtMs ? now - entry.lastClaimAtMs : 0;
    const cooldownRemainMs = entry.lastClaimAtMs
      ? Math.max(0, COLLECTION_FARM_COOLDOWN_MS - sinceClaimMs)
      : 0;
    out.push({
      collectionId: c.id,
      name: c.name,
      coverImageUrl: c.cover_image_url,
      templateCount: info.templateCount,
      perTemplate: info.perTemplate,
      minLevel: info.minLevel,
      ratePerDay: rate,
      accrued,
      totalClaimed: entry.totalClaimed,
      lastClaimAtMs: entry.lastClaimAtMs,
      cooldownRemainMs,
      canClaim: rate > 0 && cooldownRemainMs === 0,
    });
  }
  if (dirty) await saveCollFarmState(wallet, st);
  return out;
});

/**
 * Сбор билетов с коллекции. Живёт отдельной функцией, а не только в server-fn:
 * забирают коллекции теперь В МУЗЕЕ на карте (beta-raid/museum), и музей же
 * добавляет свой процент за тир. Раздел «Фишки» показывает накопление, но
 * кнопку сбора там больше не жмут — иначе музей был бы бессмысленным крюком.
 *
 * bonusPct — надбавка музея в процентах: 20 значит «билетов на 20% больше».
 */
export async function claimCollectionFarmCore(wallet: string, collectionId: string, bonusPct = 0) {
  {
    const data = { collectionId };
    await actionGate("collfarm", wallet);
    const now = Date.now();
    const st = await getCollFarmState(wallet);
    const entry = st.collections[data.collectionId] ?? { lastClaimAtMs: 0, totalClaimed: 0 };

    const info = await getMinLevelForCollection(wallet, data.collectionId);
    const rate = rateForMinLevel(info.minLevel);
    if (rate === 0) {
      resolveFarmAccrual(entry, 0, now);
      st.collections[data.collectionId] = entry;
      await saveCollFarmState(wallet, st);
      throw new Error("Коллекция не собрана: нужно по 1 фишке каждого шаблона минимум на 3★");
    }

    if (entry.lastClaimAtMs) {
      const sinceClaim = now - entry.lastClaimAtMs;
      if (sinceClaim < COLLECTION_FARM_COOLDOWN_MS) {
        throw new Error(
          `Собрать можно через ${fmtRemain(COLLECTION_FARM_COOLDOWN_MS - sinceClaim)}`,
        );
      }
    }

    const { accrued } = resolveFarmAccrual(entry, rate, now);
    // Надбавка музея: копится столько же, а на руки выдаётся больше.
    const payout = accrued * (1 + Math.max(0, bonusPct) / 100);
    if (accrued < 0.0001) {
      st.collections[data.collectionId] = entry;
      await saveCollFarmState(wallet, st);
      throw new Error(
        `Фарм запущен. Возвращайся через ${fmtRemain(COLLECTION_FARM_COOLDOWN_MS)} за билетами`,
      );
    }

    {
      // Ключ — слот кулдауна ПЛЮС аккаунт. Слот один на всех, поэтому без
      // аккаунта первый собравший в этом окне забирал ключ себе, а остальным
      // четырнадцати леджер отвечал «уже собрано». Аккаунт, а не кошелёк:
      // билеты общие на все sister-кошельки, и по кошельку слот обходился бы
      // переключением.
      const { moveTickets, ticketAccountId } = await import("./tickets-ledger");
      const account = (await ticketAccountId(wallet)) ?? wallet;
      const slot = Math.floor(now / COLLECTION_FARM_COOLDOWN_MS);
      const ref = `collfarm:${data.collectionId}:${account}:${slot}`;
      const res = await moveTickets({
        wallet,
        delta: Math.round(payout * 1e4) / 1e4,
        kind: "collection_farm",
        ref,
      });
      // Состояние пишем ТОЛЬКО после удачного начисления. Раньше «собрано
      // сейчас» записывалось первым, и если билеты не начислялись, накопленное
      // сгорало вместе с записью.
      //
      // applied=false — НЕ отказ. Строка леджера с этим ref уже есть, а ref
      // включает аккаунт и окно: значит билеты на этот счёт начислены — либо
      // слепым повтором этого же запроса из транспорта (см. контракт ретрая в
      // mcpClient), либо параллельным кликом с сестринского кошелька, у
      // которого баланс общий. Прежнее «Уже собрано» было враньём вдвойне:
      // игрок читал отказ на успешное начисление, а состояние не писалось — и
      // в следующем окне тот же период оплачивался второй раз.
      if (!res.applied) {
        console.warn(`[collfarm] начисление уже было, дописываем состояние: ${ref}`);
      }
    }
    const newEntry: CollFarmEntry = {
      lastClaimAtMs: now,
      totalClaimed: entry.totalClaimed + accrued,
      completeSinceMs: entry.completeSinceMs,
      lastRate: rate,
    };
    st.collections[data.collectionId] = newEntry;
    await saveCollFarmState(wallet, st);
    const { invalidateTicketsCache } = await import("./user");
    invalidateTicketsCache(wallet);

    return {
      claimedTickets: Math.round(payout * 1e4) / 1e4,
      totalClaimed: Math.round(newEntry.totalClaimed * 1e4) / 1e4,
      minLevel: info.minLevel,
      ratePerDay: rate,
      /** Сколько процентов добавил музей — для тоста «+20% от музея». */
      bonusPct: Math.max(0, bonusPct),
    };
  }
}

/**
 * Прежний вход из раздела «Фишки». Теперь только объясняет, куда идти:
 * сбор переехал в музей на карте (решение владельца 05.09.2026).
 */
export const claimCollectionFarm = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ collectionId: z.string().min(1) }).parse(d))
  .handler(async () => {
    throw new Error("chips.claim_in_museum");
  });
