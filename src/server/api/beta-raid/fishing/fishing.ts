// Рыбалка у воды (владелец, 04–05.10.2026; ПРАВИЛА §8.35) — ручки кнопки:
//  • getFishing — состояние заброса и досчёт созревшего ответа;
//  • getFishingPlan — что показать ползунку: попытки удочек и потолок минут;
//  • startFishing {op, minutes} — «Забросить на N минут»: герой на берегу (своя
//    клетка — суша, соседняя — вода), удочка в руках (единственная при пустых
//    руках берётся сама, §8.24), улов настроен админом. Попытки заброса
//    ограничены удочками: больше, чем они выдержат, не заказать;
//  • stopFishing — «Хватит»: досчитать созревшее и снять заброс.
// Энергию рыбалка не тратит. Повтор того же нажатия «Забросить» второго заброса
// не заводит (ключ op в строке рыбалки), а идущий на том же месте отдаётся как
// есть: таймер не сбрасывается.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { isAdminWallet } from "@/server/auth";
import { FISHING_ADMIN_ONLY } from "@/lib/featureGates";
import { accAccountId } from "@/server/api/currency/move";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { bagActor } from "@/server/api/beta-raid/loot-bag/bag-actor";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { ownCell } from "@/server/api/beta-raid/encounter-where";
import { notMainError, pickMainTool } from "@/server/api/beta-raid/main-tool/main-tool";
import { setMainSql } from "@/server/api/beta-raid/main-tool/main-tool-sql";
import { FISH_MINUTES_MAX, IDLE_FISH, type FishView } from "@/lib/raid/fishing";
import { loadFishingConfig } from "@/server/api/beta-raid/fishing/fishing-config";
import { fishBonusOf, fishBonusPlan } from "@/server/api/beta-raid/fishing/fishing-bonus";
import { chancePlanOf } from "@/lib/raid/fishChanceSteps";
import { weatherChancePlan } from "@/lib/raid/fishWeather";
import { mapWeatherCoefs } from "@/server/api/beta-raid/weather/weather-read";
import {
  fishingPlan,
  planTriesFor,
  rodTriesOf,
  type FishPlan,
} from "@/server/api/beta-raid/fishing/fishing-plan";
import { settleFishing } from "@/server/api/beta-raid/fishing/fishing-settle";
import { CANT_FISH, shoreSql, startSql } from "@/server/api/beta-raid/fishing/fishing-sql";

/** Отказы ключами словаря: удочки нет; улов не настроен. */
export const NEED_ROD = "fish.need_rod";
export const FISH_OFF = "fish.off";

/** Кто спрашивает: кошелёк (гейт рейда) и аккаунт — игрок = аккаунт. */
async function who(): Promise<{ wallet: string; account: string | null }> {
  const wallet = await requireBetaRaid();
  return { wallet, account: await accAccountId(wallet).catch(() => null) };
}

export const getFishing = createServerFn({ method: "GET" }).handler(async (): Promise<FishView> => {
  const { wallet, account } = await who();
  // Замок «только админам» (featureGates) включён — игроку «не рыбачит».
  if (FISHING_ADMIN_ONLY && !isAdminWallet(wallet)) return IDLE_FISH;
  return account ? settleFishing({ account, wallet }) : IDLE_FISH;
});

/** Ползунок заброса: сколько попыток дают удочки героя и потолок в минутах. */
export const getFishingPlan = createServerFn({ method: "GET" }).handler(
  async (): Promise<FishPlan> => {
    const wallet = await requireBetaRaid();
    const cfg = await loadFishingConfig();
    const bp = await resolveBackpack(wallet).catch(() => null);
    if (!bp) return { rodTries: 0, bonusPct: 0, maxMinutes: 0, intervalMin: cfg.intervalMin };
    return fishingPlan(bp.heroId, cfg.intervalMin, (await fishBonusOf(wallet)).bonusPct);
  },
);

export const stopFishing = createServerFn({ method: "POST" }).handler(
  async (): Promise<FishView> => {
    const { wallet, account } = await who();
    if (!account) throw new Error("market.need_account");
    return settleFishing({ account, wallet, stop: "stop" });
  },
);

/** Берег под героем: своя клетка — суша, соседняя — вода. Нет — отказ ключом. */
async function requireShore(mapId: string, q: number, r: number): Promise<void> {
  const rows = (await mcpExec(shoreSql({ mapId, q, r }), { wrapJson: true })) as Array<{
    land: boolean;
    water: boolean;
  }>;
  if (rows?.[0]?.land !== true || rows[0].water !== true) throw new Error(CANT_FISH);
}

export const startFishing = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
        /** На сколько минут забрасывают; по умолчанию — одна попытка. */
        minutes: z.number().int().min(1).max(FISH_MINUTES_MAX).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<FishView> => {
    const a = await bagActor("fishing");
    if (FISHING_ADMIN_ONLY && !isAdminWallet(a.wallet)) throw new Error(FISH_OFF);
    // Идущую рыбалку сначала досчитать: на том же месте она жива — её и отдаём.
    const cur = await settleFishing({ account: a.account, wallet: a.wallet });
    if (cur.fishing) return cur;
    const cfg = await loadFishingConfig();
    if (cfg.items.length === 0) throw new Error(FISH_OFF);
    const pos = await ownCell(a.wallet);
    if (!pos) throw new Error(CANT_FISH);
    await requireShore(a.mapId, pos.q, pos.r);
    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error("market.backpack_no_hero");
    const { pick, stack } = await pickMainTool(bp.heroId, { kind: "rod" });
    if (!pick.ok) throw pick.why === "idle" ? notMainError(stack?.name ?? "") : new Error(NEED_ROD);
    // Попытки заказа режем удочками: заказал час, удочек на сорок пять минут —
    // забрасываем на сорок пять, а не обещаем лишнего.
    const planTries = planTriesFor(data.minutes, cfg.intervalMin, await rodTriesOf(bp.heroId));
    if (planTries <= 0) throw new Error(NEED_ROD);
    // Шанс заброса — база мира (рыбаку +3, fisherBaseAdd) с бонусом героя
    // (артефакты + удача), и он
    // фиксируется в строке: снял артефакт посреди часа — заброс доживает с
    // обещанным шансом. Кроме временной удачи: истёк бафф удачи — с его срока
    // попытки идут без него (ступени chance_steps, владелец 14.10, вечер).
    const bonus = await fishBonusPlan(a.wallet);
    // Погода карты заброса (26.10.2026) — последним множителем, фиксируется с шансом.
    const chance = weatherChancePlan(
      chancePlanOf(cfg.chancePct + bonus.addPct, bonus.bonusPct, bonus.steps),
      (await mapWeatherCoefs(a.mapId)).fish,
    );
    // Рыбачит основной инструмент (§8.24): удочка — в руки (под локом героя).
    const held = sqlRow<{ set: boolean }>(
      (await mcpExec(setMainSql(bp.heroId, pick.key))) as unknown[],
    );
    if (held?.set !== true) throw new Error(NEED_ROD);
    const res = sqlRow<{ put: string | null; here: boolean }>(
      (await mcpExec(
        startSql({
          account: a.account,
          op: data.op,
          heroId: bp.heroId,
          mapId: a.mapId,
          q: pos.q,
          r: pos.r,
          intervalMin: cfg.intervalMin,
          planTries,
          chancePct: chance.chancePct,
          chanceSteps: chance.steps,
        }),
      )) as unknown[],
    );
    // Сошёл с клетки между проверкой берега и записью — рыбалки нет.
    if (!res?.put && res?.here !== true) throw new Error(CANT_FISH);
    // Улов прошлой рыбалки, досчитанный перед стартом, — тоже в ответ (тост).
    const fresh = await settleFishing({ account: a.account, wallet: a.wallet });
    return { ...fresh, got: [...cur.got, ...fresh.got] };
  });
