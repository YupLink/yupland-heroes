// Казино: слот на золото — ручки для браузера. Ядро (состояние, ход,
// транзакция slot_commit) — slot-core.ts; здесь только вход и проверка ввода.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCurrentWallet, getSessionTgId } from "../../auth";
import { isGoogleOnlyTg } from "@/lib/auth/googleTg";
import { requireBetaRaid } from "../beta-raid/gate";
import { accAccountId } from "../currency/move";
import { slotActFor, slotLoadFor, view, type SlotView } from "./slot-core";
import type { ClientAction } from "@/lib/slot/serverStep";

export type { SlotView } from "./slot-core";

async function who(): Promise<string> {
  // Не вошёл — браузер крутит холостую игру (lib/slot/demoSlot), золота не касается.
  if (!getCurrentWallet()) throw new Error("slot.guest");
  // Вход через Google — казино закрыто (владелец, 06.11.2026).
  if (isGoogleOnlyTg(getSessionTgId())) throw new Error("slot.google");
  const wallet = await requireBetaRaid();
  const account = await accAccountId(wallet);
  if (!account) throw new Error("slot.need_account");
  return account;
}

export const slotLoad = createServerFn({ method: "GET" }).handler(async (): Promise<SlotView> => {
  const account = await who();
  const { state, version, gold } = await slotLoadFor(account);
  return view(state, gold, version);
});

const ACTIONS = [
  "spin",
  "collect",
  "risk-start",
  "risk-pick",
  "risk-next",
  "risk-take",
  "risk-close",
  "bonus-enter",
  "bonus-pick",
  "bonus-close",
  "super-enter",
  "super-pick",
  "super-next",
  "bonus-finish",
  // «stats-reset» с браузера не принимаем: статистика автомата — источник
  // админской статистики казино (slot-stats.ts), игрок её не обнуляет.
] as const;

/** Что прислал браузер: вид хода и его параметры. Проверку значений делает serverStep. */
const actionSchema = z
  .object({
    type: z.enum(ACTIONS),
    lines: z.number().int().optional(),
    bet: z.number().int().optional(),
    index: z.number().int().min(0).max(3).optional(),
    col: z.number().int().min(0).max(4).optional(),
    side: z.union([z.literal(0), z.literal(1)]).optional(),
  })
  .transform((a): ClientAction => {
    if (a.type === "spin") return { type: "spin", lines: a.lines ?? 0, bet: a.bet ?? 0 };
    if (a.type === "risk-pick") return { type: "risk-pick", index: a.index ?? 0 };
    if (a.type === "bonus-pick") return { type: "bonus-pick", col: a.col ?? 0 };
    if (a.type === "super-pick") return { type: "super-pick", side: a.side ?? 0 };
    return { type: a.type } as ClientAction;
  });

export const slotAct = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ action: actionSchema, version: z.number().int().min(0) }).parse(d),
  )
  .handler(
    async ({ data }): Promise<SlotView> => slotActFor(await who(), data.action, data.version),
  );
