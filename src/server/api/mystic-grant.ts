// Выдача приза мистического бокса — любого вида (владелец, 29.09): пак или
// другой бокс, артефакт, герой, свой товар (зелья, инструменты, сундуки — в
// рюкзак героя), ресурс, токен на счёт, билеты (с 20.10 — золотом), энергия, лайки.
//
// Приз выдаётся ровно один раз на бокс: у каждого вида ключ повтора — ref
// «mystic:<грант>» (леджеры токенов/ресурсов/билетов/лайков, op-лог рюкзака),
// а где своего ключа нет (энергия, пак, предмет) — метка в gift_deliver_op.
// Бросок — выдать не удалось; вызывающий вернёт бокс закрытым, а выпавший
// приз останется за ним (mystic.ts) — повтор выдаст ТОТ ЖЕ приз.
import { secureRandomInt as randomInt } from "@/lib/secureRandom";
import { pg, sb } from "../db/pg";
import type { PgMysticItemTemplate } from "../db/pg";
import { accountOf } from "./user-shared";
import { AMOUNT_KINDS, type MysticKind } from "@/lib/mysticKinds";
import { isUsdt } from "@/lib/usdtBanned";

/** Тир пула — то, что нужно выдаче (полная схема — mystic.ts). */
export type TierLike = {
  kind: MysticKind;
  label?: string;
  packId?: string;
  amountMin?: number;
  amountMax?: number;
  token?: string;
  resource?: string;
  customId?: string;
  customName?: string;
  itemTemplateId?: string;
};

export type MysticPrize = {
  kind: MysticKind | "blank";
  amount?: number;
  name?: string;
  image?: string | null;
  /** Артефакт: common/rare/epic/legendary. Герой: звёзды. */
  rarity?: string | null;
  level?: number | null;
  /** Ресурс (gold/stone/wood/diamonds) или токен (USDT/Darai/STARS). */
  code?: string | null;
  /**
   * Герой/артефакт: id выданного экземпляра (user_game_item) — чтобы «Посмотреть в
   * Таверне» открыл именно его среди одинаковых (Ангелина, ТЗ №4/№37, 16.10.2026).
   * У результатов, сохранённых раньше, поля нет.
   */
  itemId?: string;
};

/** Сколько выдать: целые — штучно, токены — до сотых (звёзды — целые). */
export function rollAmount(t: TierLike): number {
  if (!AMOUNT_KINDS.includes(t.kind)) return 0;
  const cents = (t.kind === "token" || t.kind === "ft") && t.token !== "STARS";
  const k = cents ? 100 : 1;
  const a = Math.max(0, Math.round((t.amountMin ?? 0) * k));
  const b = Math.max(a, Math.round((t.amountMax ?? t.amountMin ?? 0) * k));
  return randomInt(a, b + 1) / k;
}

async function once<T>(ref: string, grantId: string, run: () => Promise<T>): Promise<void> {
  const { claimDeliverOnce, releaseDeliverOnce } = await import("./gifts-once");
  if (!(await claimDeliverOnce(ref, grantId))) return; // уже выдано этим боксом
  try {
    await run();
  } catch (e) {
    await releaseDeliverOnce(ref);
    throw e;
  }
}

/** Выдать выпавший приз. amount — уже выброшенный при открытии (не бросаем заново). */
export async function deliverMysticTier(
  wallet: string,
  grantId: string,
  tier: TierLike,
  amount: number,
): Promise<MysticPrize> {
  const ref = `mystic:${grantId}`;
  const k = tier.kind;

  if (k === "pack" && tier.packId) {
    const { grantPackToUser } = await import("./packs");
    await once(ref, grantId, () =>
      grantPackToUser({ wallet, packId: tier.packId!, source: "admin_grant", sourceRef: ref }),
    );
    const p = await pg.chipPacks.findOne({ id: tier.packId });
    return { kind: "pack", name: tier.label || p?.name || undefined, image: p?.cover_image_url ?? null };
  }
  if (k === "energy") {
    if (amount > 0) {
      await once(ref, grantId, async () => {
        const { error } = await sb.rpc("add_energy", { p_wallet: wallet, p_amount: amount, p_kind: "energy_mystic" });
        if (error) throw new Error(error.message);
      });
    }
    return { kind: "energy", amount };
  }
  if (k === "tickets") {
    // Тир билетов (старые пулы) выдаётся золотом, 100 за билет (§8.61), и
    // показывается как приз-ресурс «золото». Ключ — ref бокса: повтор не задвоит.
    const { creditGoldForTickets } = await import("./gold-earn");
    const gold = await creditGoldForTickets({ wallet, tickets: amount, kind: "mystic", ref });
    const { noteBoxPrize } = await import("@/server/api/beta-raid/econ/box-note");
    void noteBoxPrize({ wallet, kind: "resource", code: "gold", amount: gold, ref });
    return { kind: "resource", amount: gold, code: "gold" };
  }
  if (k === "likes") {
    const { likeAccountId, addLikes } = await import("../likesAccount");
    if (amount > 0) await addLikes(await likeAccountId(wallet), amount, "lifetime_granted", ref);
    return { kind: "likes", amount };
  }
  if ((k === "resource" && tier.resource) || (k === "custom" && tier.customId)) {
    const { grantExtraReward } = await import("./raid-reward-extra");
    const code = k === "resource" ? tier.resource! : tier.customId!;
    await grantExtraReward({ kind: k, wallet, amount, ref: code, opRef: ref });
    // Журнал: приз бокса — не добыча, его продажа в «Золото» прибыли не даёт.
    const { noteBoxPrize } = await import("@/server/api/beta-raid/econ/box-note");
    const box = { wallet, kind: k, code, amount, ref };
    if (k === "resource") {
      void noteBoxPrize(box);
      return { kind: k, amount, code };
    }
    const { canonCustomMeta } = await import("./beta-raid/item-alias");
    const meta = await canonCustomMeta(code).catch(() => null);
    void noteBoxPrize({ ...box, name: meta?.name || tier.customName });
    return { kind: k, amount, code, name: tier.label || meta?.name || tier.customName, image: meta?.image ?? null };
  }
  if (k === "token" && tier.token) {
    // USDT бокс не выдаёт (ПРАВИЛА §8.49а): старый тир с ним — «пусто», не деньги.
    if (isUsdt(tier.token)) {
      console.warn("[mystic] тир USDT пропущен — бокс USDT не выдаёт", grantId);
      return { kind: "blank" };
    }
    const { accMove } = await import("./currency/move");
    if (amount > 0) await accMove({ wallet, token: tier.token, delta: amount, kind: "acc_reward", ref });
    return { kind: "token", amount, code: tier.token };
  }
  if ((k === "artifact" || k === "hero") && tier.itemTemplateId) {
    const tpl = await pg.mysticItemTemplates.raw().select("*").eq("id", tier.itemTemplateId).maybeSingle();
    const t = tpl.data as PgMysticItemTemplate | null;
    if (!t) return { kind: "blank" };
    const account = await accountOf(wallet);
    // id от бокса, а не случайный: повторная выдача того же бокса знает экземпляр.
    const itemId = `ugi_mb_${grantId}`;
    await once(ref, grantId, () =>
      pg.userGameItems.insert({
        id: itemId,
        account_id: account,
        wallet,
        template_id: t.id,
        kind: t.kind,
        source: "mystic",
        obtained_at: new Date().toISOString(),
      }),
    );
    // Выдан до этой правки (случайный id) — экземпляра под этим id нет, поле не отдаём.
    const own = await pg.userGameItems.findOne({ id: itemId }).catch(() => null);
    return {
      kind: k,
      name: t.name,
      image: t.image_url,
      rarity: t.rarity ?? null,
      level: t.level ?? null,
      ...(own ? { itemId } : {}),
    };
  }
  // nft/ft — старые заглушки: призового кошелька под них нет → «пусто».
  return { kind: "blank" };
}
