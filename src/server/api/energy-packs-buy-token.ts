// Покупка энергии за FT-токен экосистемы (on-chain) — ЗАКРЫТА.
//
// Владелец, 20.10.2026 (ПРАВИЛА §8.61): энергопак продаётся только за золото
// (вместо билетов), DARAI и звёзды. USDT, magicdust, RF, HOPE и прочие токены
// не принимаются. Ручка оставлена, чтобы старый клиент получил понятный отказ,
// а не 404; перевод он подписывает только после выбора токена, которого в окне
// больше нет. Перевод токеном, отправленный до среза 21.10.2026, добивает
// догон (lost-payments-energy-settle, по времени блока); позже — не зачитывается.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ENERGY_PAY_ONLY } from "@/lib/energyPayAllowed";

export const buyEnergyPackViaToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        packId: z.string().min(1),
        txHash: z.string().min(20).max(64),
        tokenSymbol: z.string().min(1).max(24).optional(),
      })
      .parse(d),
  )
  .handler(
    async (): Promise<{
      ok: true;
      energyAdded: number;
      already?: boolean;
      tokenSymbol?: string;
      tokenSpent?: number;
    }> => {
      throw new Error(ENERGY_PAY_ONLY);
    },
  );
