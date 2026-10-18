// Mining state management for chip slots.
import { pg } from "../db/pg";

const STAKE_FREE_SLOTS = 3;
const STAKE_TOTAL_SLOTS = 12;

export type MiningState = {
  unlocked: number;
  lifetimeMined: number;
  lifetimeLikesMined: number;
  pendingLikes: number;
  accruedBuffer: number;
  lifetimeSlotSpend: number;
  lastClaimAtMs: number;
  slots: Record<string, { chipId: string; lastClaimMs: number }>;
};

function miningRatePerDay(level: number): number {
  const n = Math.max(1, Math.min(9, Math.round(level * 2) - 1));
  return 1 / Math.pow(2, 9 - n);
}

function slotAccrued(level: number, lastClaimMs: number, nowMs: number): number {
  const days = Math.max(0, (nowMs - lastClaimMs) / 86_400_000);
  return miningRatePerDay(level) * days;
}

function emptyMiningState(): MiningState {
  return {
    unlocked: STAKE_FREE_SLOTS,
    lifetimeMined: 0,
    lifetimeLikesMined: 0,
    pendingLikes: 0,
    accruedBuffer: 0,
    lifetimeSlotSpend: 0,
    lastClaimAtMs: 0,
    slots: {},
  };
}

/**
 * Ключ состояния майнинга — аккаунт. Раньше здесь выбирался «канонический
 * кошелёк ТГ-группы»; у игрока без кошелька такого адреса не существует, а у
 * игрока с двумя адресами он менялся при отвязке — и намайненное пропадало.
 */
async function canonicalWallet(wallet: string): Promise<string> {
  const { accountOf } = await import("./user-shared");
  return accountOf(wallet);
}

export async function getMiningState(wallet: string): Promise<MiningState> {
  const canon = await canonicalWallet(wallet);
  const row = await pg.settings.findOne({ key: `mining:${canon}` });
  if (!row?.value) return emptyMiningState();
  try {
    const st = JSON.parse(row.value) as Partial<MiningState>;
    return {
      unlocked: Math.max(STAKE_FREE_SLOTS, Math.min(STAKE_TOTAL_SLOTS, st.unlocked ?? STAKE_FREE_SLOTS)),
      lifetimeMined: Number(st.lifetimeMined ?? 0),
      lifetimeLikesMined: Number(st.lifetimeLikesMined ?? 0),
      pendingLikes: Number(st.pendingLikes ?? 0),
      accruedBuffer: Number(st.accruedBuffer ?? 0),
      lifetimeSlotSpend: Number(st.lifetimeSlotSpend ?? 0),
      lastClaimAtMs: Number(st.lastClaimAtMs ?? 0),
      slots: st.slots ?? {},
    };
  } catch {
    return emptyMiningState();
  }
}

/** Ключ владельца — аккаунт: под ним живёт состояние майнинга. */
export async function miningCanonicalWallet(wallet: string): Promise<string> {
  return canonicalWallet(wallet);
}

export async function saveMiningState(wallet: string, st: MiningState): Promise<void> {
  const canon = await canonicalWallet(wallet);
  await pg.settings.upsert(
    { key: `mining:${canon}`, value: JSON.stringify(st) },
    { onConflict: "key" }
  );
}

type ChipMeta = {
  level: number;
  templateId: string;
  name: string;
  imageUrl: string;
  serialNo: number | null;
};
/**
 * Данные фишек слота. Если задан `owner`, берём ТОЛЬКО те, что и сейчас лежат
 * у него во владении: слот продолжал капать с фишки, которую уже продали,
 * вывели в NFT или сожгли в крафте — строка инвентаря оставалась, а проверка
 * владения была только при установке.
 */
async function chipMeta(chipIds: string[], owner?: string[]): Promise<Map<string, ChipMeta>> {
  const m = new Map<string, ChipMeta>();
  if (chipIds.length === 0) return m;
  let q = pg.userChipInventory.raw().select("id,level,template_id,serial_no").in("id", chipIds);
  if (owner && owner.length > 0) q = q.eq("status", "owned").in("wallet", owner);
  const { data } = await q;
  const rows = (data ?? []) as Array<{
    id: string;
    level: number;
    template_id: string;
    serial_no: number | null;
  }>;
  const tplIds = Array.from(new Set(rows.map((r) => r.template_id)));
  const { data: tplRows } = await pg.chipTemplates
    .raw()
    .select("id,name,image_url")
    .in("id", tplIds);
  const tplMap = new Map(
    ((tplRows ?? []) as Array<{ id: string; name: string; image_url: string }>).map(
      (t) => [t.id, t]
    )
  );
  for (const c of rows) {
    const t = tplMap.get(c.template_id);
    m.set(c.id, {
      level: c.level,
      templateId: c.template_id,
      name: t?.name ?? "",
      imageUrl: t?.image_url ?? "",
      serialNo: c.serial_no,
    });
  }
  return m;
}

export async function settleMiningSlots(
  st: MiningState,
  slotIdxes: string[] | null,
  fallbackLevels?: Map<string, number>,
  /** Кошельки аккаунта. Заданы — фишка обязана всё ещё принадлежать ему. */
  owner?: string[]
): Promise<void> {
  const idxList = slotIdxes ?? Object.keys(st.slots);
  if (idxList.length === 0) return;
  const chipIds = idxList
    .map((i) => st.slots[i]?.chipId)
    .filter((x): x is string => typeof x === "string" && x.length > 0);
  if (chipIds.length === 0) return;
  const meta = await chipMeta(chipIds, owner);
  const now = Date.now();
  for (const idx of idxList) {
    const a = st.slots[idx];
    if (!a) continue;
    const lvl = meta.get(a.chipId)?.level ?? fallbackLevels?.get(a.chipId);
    if (lvl == null) {
      // Фишки в слоте больше нет у владельца — слот освобождаем, накопленное
      // по ней не начисляем. Иначе продал фишку, а она всё копает.
      if (owner && owner.length > 0) delete st.slots[idx];
      continue;
    }
    st.accruedBuffer += slotAccrued(lvl, a.lastClaimMs, now);
    a.lastClaimMs = now;
  }
}
