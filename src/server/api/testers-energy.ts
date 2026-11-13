// Выдача энергии тестерам — раздел владельца (гейт как у «Выплат»).
//
// Нужна, чтобы закрытая механика тестировалась без ожидания регена: энергия
// капает по +1 за 5 минут, а на прогулку по гекс-карте её нужно много.
// add_energy кладёт бонус ПОВЕРХ cap и сам резолвит канонический кошелёк
// TG-группы, поэтому выдача доходит и с сестринского входа.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg, sb } from "../db/pg";
import { requirePayoutsAdmin } from "../auth";
import { invalidateTesters } from "./testers";
import { accountIdOf } from "./user-shared";

const MAX_GRANT = 5_000;

async function testerWallets(): Promise<string[]> {
  const { data } = await pg.testers.raw().select("wallet").order("added_at", { ascending: true });
  return ((data ?? []) as Array<{ wallet: string }>).map((r) => r.wallet.trim().toLowerCase());
}

/** Текущая энергия каждого тестера — по ней видно, что выдача дошла. */
export const adminTestersEnergy = createServerFn({ method: "GET" }).handler(async () => {
  requirePayoutsAdmin();
  const wallets = await testerWallets();
  const rows = await Promise.all(
    wallets.map(async (wallet) => {
      // Спрашиваем по аккаунту: адрес в списке тестеров приведён к нижнему
      // регистру, а сверка адресов регистр учитывает — и энергия «терялась».
      const acc = await accountIdOf(wallet);
      const { data } = acc
        ? await sb.rpc("compute_energy", { p_wallet: acc })
        : { data: null };
      const first = (data as Array<{ energy_now: number; max_energy: number }> | null)?.[0];
      return {
        wallet,
        energy: first ? Number(first.energy_now) : null,
        maxEnergy: first ? Number(first.max_energy) : null,
      };
    }),
  );
  return { rows };
});

/**
 * Начислить энергию: всем тестерам сразу или одному конкретному — ПОДАРКОМ.
 * Адресная выдача — только по кошельку из списка тестеров, чтобы раздел
 * не превратился в общий кран энергии.
 *
 * Подарком, как и всё остальное админское добро: энергия появится, когда
 * тестер заберёт её в кружке на карте (см. gifts.ts). Так у выдачи есть
 * подтверждение получения, а не только строка в логе.
 */
export const adminGrantTesterEnergy = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        // Энергия дробная (numeric в БД) — целое тут не требуем.
        amount: z.number().positive().max(MAX_GRANT),
        wallet: z.string().min(2).max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requirePayoutsAdmin();
    const wallets = await testerWallets();

    let targets = wallets;
    if (data.wallet) {
      const wanted = data.wallet.trim().toLowerCase();
      if (!wallets.includes(wanted)) throw new Error("Этого кошелька нет в списке тестеров");
      targets = [wanted];
    }
    if (targets.length === 0) throw new Error("Список тестеров пуст");

    // Двенадцать последовательных RPC занимали шесть секунд — шлём разом.
    const results = await Promise.all(
      targets.map(async (wallet) => {
        // Начисляем на аккаунт: у энергии нет владельца-адреса, и молчаливый
        // промах по регистру раньше рапортовал «выдано» при нулевой выдаче.
        const acc = await accountIdOf(wallet);
        if (!acc) return { wallet, ok: false };
        const { createGift } = await import("./gifts-create");
        // Ключ на пятиминутное окно: повтор запроса и второе нажатие «а вдруг
        // не прошло» попадают в тот же ключ и не удваивают энергию. Заголовок
        // не пишем — карточка покажет локализованное «Энергия».
        const window5 = Math.floor(Date.now() / 300_000);
        const ok = await createGift({
          accountId: acc,
          kind: "energy",
          amount: data.amount,
          sourceRef: `tester-energy:${window5}:${data.amount}:${acc}`,
          createdBy: "admin_testers",
        }).catch(() => false);
        return { wallet, ok };
      }),
    );
    const failed = results.filter((r) => !r.ok).map((r) => r.wallet);
    invalidateTesters();

    return {
      ok: failed.length === 0,
      amount: data.amount,
      granted: targets.length - failed.length,
      failed,
    };
  });
