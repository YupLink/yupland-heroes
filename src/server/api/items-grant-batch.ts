// Пакетная выдача артефактов и героев — как раздача мистик-боксов, только
// предметом. Одна кнопка админки → список кошельков, каждому своё количество.
//
// Герой выдаётся ровно так же, как артефакт: строкой в user_game_item с
// kind='hero'. Экземпляр (hero_instance) заводится лениво — при первой
// прокачке или выборе в отряд, до этого герой живёт «спящим»
// (heroes-list-dormant). Заводить экземпляр здесь нельзя: у одного шаблона
// может быть несколько копий, а экземпляр хранит прокачку одной из них.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import type { PgMysticItemTemplate } from "../db/pg";
import { requireAdmin } from "../auth";
import { notifyItemGrant } from "../notifyItemGrant";
import { accountOf } from "./user-shared";

// Лимиты того же порядка, что у мистик-боксов (count 1..500). Кошельков за
// один запрос — 200: больше в админку руками не вставляют, а SQL остаётся
// вменяемого размера.
const MAX_TARGETS = 200;
const MAX_COUNT = 500;

export type GrantBatchRow = {
  wallet: string;
  count: number;
  ok: boolean;
  error?: string;
};

export const grantBatchInputSchema = z.object({
  templateId: z.string().min(1),
  targets: z
    .array(
      z.object({
        wallet: z.string().trim().min(3).max(120),
        count: z.number().int().min(1).max(MAX_COUNT),
      }),
    )
    .min(1)
    .max(MAX_TARGETS),
});

export type GrantBatchInput = z.infer<typeof grantBatchInputSchema>;

/** Сама раздача (без гейта и валидации) — вынесена, чтобы её можно было
 *  прогнать напрямую скриптом: серверную функцию вне HTTP не вызвать. */
export async function grantItemsBatch(input: GrantBatchInput) {
  const tpl = await pg.mysticItemTemplates
    .raw()
    .select("*")
    .eq("id", input.templateId)
    .maybeSingle();
  const t = tpl.data as PgMysticItemTemplate | null;
  if (!t) throw new Error("Предмет не найден");

  // Один кошелёк, названный дважды, — одна строка результата с суммой:
  // иначе человек получил бы два уведомления об одной раздаче. Сёстры одного
  // аккаунта схлопываются ниже, когда станут известны их account_id: ключ
  // подарка собран из аккаунта, и две строки на одного игрока отбрасывались
  // бы по ключу повтора, а счётчик рапортовал бы «выдано вдвое».
  const merged: Array<{ wallet: string; count: number }> = [];
  const seen = new Map<string, number>();
  for (const tg of input.targets) {
    const w = tg.wallet.trim();
    const at = seen.get(w);
    if (at === undefined) {
      seen.set(w, merged.length);
      merged.push({ wallet: w, count: tg.count });
    } else {
      merged[at].count = Math.min(MAX_COUNT, merged[at].count + tg.count);
    }
  }

  // Неизвестный кошелёк выдачу не роняет — он отдаётся с ошибкой, остальные
  // проходят. Без этой проверки предмет молча лёг бы «в никуда»: FK на
  // wallet в user_game_item нет, опечатка создала бы предмет-сироту.
  const { data: known } = await pg.users
    .raw()
    .select("wallet")
    .in(
      "wallet",
      merged.map((m) => m.wallet),
    );
  const knownSet = new Set(((known ?? []) as Array<{ wallet: string }>).map((r) => r.wallet));

  const now = new Date().toISOString();
  const perWallet: GrantBatchRow[] = [];
  const delivered: Array<{ wallet: string; count: number }> = [];
  let granted = 0;

  // Аккаунты, которым в этой раздаче уже выдали: второй кошелёк того же
  // игрока не должен ни удваивать счётчик, ни получать второе письмо.
  const servedAccounts = new Map<string, string>();

  for (const m of merged) {
    if (!knownSet.has(m.wallet)) {
      perWallet.push({ wallet: m.wallet, count: 0, ok: false, error: "Кошелёк не найден" });
      continue;
    }
    // Подарком, а не прямо в инвентарь: игрок сам заберёт его в кружке на
    // карте, и мы увидим, что подарок дошёл (см. gifts.ts). Одна строка на
    // кошелёк — количество лежит в amount.
    const grantAccount = await accountOf(m.wallet);
    const twin = servedAccounts.get(grantAccount);
    if (twin) {
      perWallet.push({
        wallet: m.wallet,
        count: 0,
        ok: false,
        error: `Тот же игрок, что ${twin} — подарок уже выдан`,
      });
      continue;
    }
    try {
      const { createGift } = await import("./gifts-create");
      await createGift({
        accountId: grantAccount,
        kind: t.kind === "hero" ? "hero" : t.kind === "artifact" ? "art" : "item",
        amount: m.count,
        refId: t.id,
        title: t.name,
        image: t.image_url ?? null,
        sourceRef: `admin-batch:${t.id}:${grantAccount}:${now}`,
        createdBy: "admin_batch",
      });
      granted += m.count;
      servedAccounts.set(grantAccount, m.wallet);
      delivered.push({ wallet: m.wallet, count: m.count });
      perWallet.push({ wallet: m.wallet, count: m.count, ok: true });
    } catch (e) {
      perWallet.push({
        wallet: m.wallet,
        count: 0,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Уведомление — побочный эффект: подарки уже записаны, падение телеграма
  // раздачу не отменяет (notifyItemGrant не бросает).
  const notified = await notifyItemGrant(delivered, {
    kind: t.kind,
    name: t.name,
    rarity: t.rarity ?? null,
    level: t.level ?? null,
    specialization: t.specialization ?? null,
  });

  return { ok: true as const, granted, perWallet, notified };
}

export const adminGrantItemsBatch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => grantBatchInputSchema.parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    return grantItemsBatch(data);
  });
