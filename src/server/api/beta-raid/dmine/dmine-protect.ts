// «Защита на час» гриба (владелец, 22.10.2026; lib/mushroomRipe): сразу после
// ручной посадки окно предлагает защиту за MUSHROOM_PROTECT_ENERGY энергии.
// Согласился — гриб «созревает» час от посадки: другой игрок его не поднимет
// (raid_dmine_take: dmine_unripe). Отказался или закрыл окно — защиты нет.
//
// Защищается только посадка этого игрока по её ключу нажатия (dmplace:…) — та,
// что прислала окно посадки; автопосадка (dmauto:…) и ничейные грибы — нет.
// Только пока идёт первый час после посадки, один раз, без продления.
//
// Проверки, энергия и отметка созревания — одна функция базы под локом шахты
// клетки (migrations/mushroom-04). Повтор нажатия энергию второй раз не берёт:
// защита уже стоит — тот же ответ. Ответ потерялся после коммита — судит
// отметка созревания у этой посадки.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { MUSHROOM_PROTECT_ENERGY, ripeAtMs } from "@/lib/mushroomRipe";
import { pchestActor } from "@/server/api/beta-raid/plain-chest/pchest-row";
import {
  placeOpKey,
  protectDmineSql,
  protectErrorOf,
  protectResOf,
  protectStateSql,
} from "@/server/api/beta-raid/dmine/dmine-protect-sql";

const input = z.object({
  /** Ключ нажатия посадки (тот же, что ушёл в «Посадить»). */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
});

export type DmineProtected = {
  ok: true;
  /** До какой минуты созревает (мс); час уже вышел — null. */
  ripeAt: number | null;
  /** Сколько энергии списано этим нажатием (повтор — 0). */
  cost: number;
  q: number;
  r: number;
};

type ProtectState = { set: boolean; ripeAt: number | null; q: number; r: number };

/** Защита этой посадки: уже стоит или нет; посадки нет или сбой чтения — null. */
async function loadProtect(placeOp: string): Promise<ProtectState | null> {
  const rows = (await mcpExec(protectStateSql(placeOp), { wrapJson: true }).catch(
    () => [],
  )) as Array<{ ripeAt?: unknown; q?: unknown; r?: unknown }> | null;
  const row = rows?.[0];
  if (!row) return null;
  return {
    set: row.ripeAt != null,
    ripeAt: ripeAtMs(row.ripeAt),
    q: Number(row.q) || 0,
    r: Number(row.r) || 0,
  };
}

/** Энергия ушла этим нажатием — заметка о трате (как у посадки). */
async function noteSpend(account: string, paid: number): Promise<void> {
  if (!(paid > 0)) return;
  const { noteEnergySpend } = await import("@/server/api/beta-raid/econ/energy-note");
  void noteEnergySpend(account, paid, "build");
}

export const protectMushroom = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<DmineProtected> => {
    const a = await pchestActor("dmine-protect");
    const placeOp = placeOpKey(a.account, data.op);
    const cost = MUSHROOM_PROTECT_ENERGY;

    // Повтор уже сделанного нажатия: защита стоит — тот же ответ, без траты.
    const prev = await loadProtect(placeOp);
    if (prev?.set) return { ok: true, ripeAt: prev.ripeAt, cost: 0, q: prev.q, r: prev.r };

    const sql = protectDmineSql({ placeOp, account: a.account, wallet: a.wallet, cost });
    let failed: unknown = null;
    try {
      const res = protectResOf(await mcpExec(sql, { wrapJson: true }));
      if (res) {
        // Защиты до запроса не было (проверено выше) — это первое нажатие, даже
        // если база ответила «повтор»: мост повторил наш же запрос вслепую.
        const paid = res.was ? cost : res.paid;
        await noteSpend(a.account, paid);
        return { ok: true, ripeAt: res.ripeAt, cost: paid, q: res.q, r: res.r };
      }
    } catch (e) {
      // Отказ базы (поздно, гриба нет, энергии мало) — сразу, ключом словаря.
      const mapped = protectErrorOf(e, cost);
      if (mapped !== e) throw mapped;
      failed = e;
    }
    // Пустой ответ или обрыв: защита легла только вместе с энергией.
    const done = await loadProtect(placeOp);
    if (!done?.set) throw failed ?? new Error("chest.busy");
    await noteSpend(a.account, cost);
    return { ok: true, ripeAt: done.ripeAt, cost, q: done.q, r: done.r };
  });
