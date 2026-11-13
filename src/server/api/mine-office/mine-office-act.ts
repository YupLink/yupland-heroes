// «Управление шахтами»: режим и починка своей шахты удалённо, из замка
// (сбор — mine-office-claim.ts).
//
// Сервер проверяет (officeGate): здание построено у этого аккаунта, герой в
// замке (requireAtCastle — тот же признак, что у смены героя); здесь — шахта
// своя работающая. Дальше — то же ядро, что у окна шахты на карте
// (mine-v2-core.ts): те же цены, ключ повтора, база, рассылка. Карта шахты —
// любая: владение проверяет база под локом шахты.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  modeSchema,
  repairMineAt,
  setMineModeAt,
  type RepairResult,
} from "@/server/api/beta-raid/mine-v2-core";
import { officeGate } from "./mine-office-own";

const cellSchema = z.object({
  mapId: z.string().min(1).max(128),
  q: z.number().int(),
  r: z.number().int(),
  mode: modeSchema,
});

export const officeSetMineMode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => cellSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { account } = await officeGate("mine-mode");
    return setMineModeAt({ account, ...data, own: true });
  });

export const officeRepairMine = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    cellSchema.extend({ opId: z.string().min(8).max(64) }).parse(d),
  )
  .handler(async ({ data }): Promise<RepairResult> => {
    const { wallet, account } = await officeGate("mine-repair");
    return repairMineAt({ wallet, account, ...data, own: true });
  });
