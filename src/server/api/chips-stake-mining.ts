// Стейкинг фишек ЗАКРЫТ (04.09.2026): механика переехала в Университет на карте
// бета-рейда (см. beta-raid/university.ts). Разовым прогоном
// _shutdown-stake-2026-09-04 накопленное роздано игрокам, слоты очищены; фишки
// в инвентаре не тронуты (статус 'owned').
//
// Функции сохранены как заглушки: старый клиент, оставшийся с прежним бандлом,
// не должен ронять экран — он получает пустое состояние и понятную ошибку на
// действиях.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CLOSED = "Стейкинг закрыт: теперь Университет на карте бета-рейда";
function closed(): never {
  throw new Error(CLOSED);
}

export const listMiningSlots = createServerFn({ method: "GET" }).handler(async () => ({
  slots: [] as Array<never>,
  nextUnlockPrice: null as number | null,
  cooldownRemainMs: 0,
  closed: true as const,
}));

export const unlockMiningSlot = createServerFn({ method: "POST" }).handler(async () => closed());

export const setMiningSlotChip = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ slotIdx: z.number().int(), chipId: z.string().min(1) }).parse(d))
  .handler(async () => closed());

export const clearMiningSlot = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ slotIdx: z.number().int() }).parse(d))
  .handler(async () => closed());

export const claimMiningRewards = createServerFn({ method: "POST" }).handler(async () => closed());
