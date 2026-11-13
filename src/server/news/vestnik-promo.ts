// Промокод выпуска «Вестника героев» (владелец, 29.10.2026): в каждом выпуске
// мелко прячется код — награда внимательным. Энергия или лайки, 1–100 штук,
// на 1–100 игроков; всё выбирается случайно при создании кода.
//
// Код один на выпуск: id `pcd_vestnik_<вид>_<дата>`, повторная сборка того же
// выпуска находит готовый (createSql кладёт код и строку одним запросом).
// Вводится в профиле, как любой промокод (§8.90).
import { mcpExec } from "@/server/db/mcpClient";
import { generatePromoCode } from "@/lib/promo/promoCode";
import { createSql, ownCodeSql } from "@/server/api/promo/promo-admin-sql";

export type PromoRoll = { kind: "energy" | "likes"; amount: number; users: number };

/** Случайное целое 1…100 без перекоса; rand — для тестов. */
const upTo100 = (rand: () => number): number => 1 + Math.min(99, Math.floor(rand() * 100));

const cryptoRand = (): number => globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

/** Что даёт код выпуска: вид, сколько каждому и скольким игрокам. */
export function rollPromo(rand: () => number = cryptoRand): PromoRoll {
  return {
    kind: rand() < 0.5 ? "energy" : "likes",
    amount: upTo100(rand),
    users: upTo100(rand),
  };
}

const first = (rows: unknown): Record<string, unknown> =>
  (Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined) ?? {};

/** Код выпуска: готовый — его, нет — завести. Сбой базы — null (выпуск выйдет без кода). */
export async function issuePromo(
  issueKey: string,
  roll: PromoRoll = rollPromo(),
): Promise<string | null> {
  const id = `pcd_vestnik_${issueKey}`;
  try {
    const own = first(await mcpExec(ownCodeSql(id), { wrapJson: true }));
    if (typeof own.code === "string" && own.code) return own.code;
    const line = {
      kind: roll.kind,
      ref: null,
      title: null,
      image: null,
      min: roll.amount,
      max: roll.amount,
      chance: 100,
      budget: null,
    };
    // Занятый код (редкое совпадение) — ещё попытка с новым.
    for (let i = 0; i < 3; i++) {
      const code = generatePromoCode();
      const res = first(
        await mcpExec(
          createSql({ id, code, maxUsers: roll.users, createdBy: "vestnik", lines: [line] }),
        ),
      );
      if (typeof res.id === "string" && res.id) return code;
      const again = first(await mcpExec(ownCodeSql(id), { wrapJson: true }));
      if (typeof again.code === "string" && again.code) return again.code;
    }
  } catch (e) {
    console.warn("[vestnik] промокод не завёлся:", e instanceof Error ? e.message : e);
  }
  return null;
}

/**
 * Код дня для газеты в игре (Ангелина, владелец 30.10.2026: «рандомные промики
 * делай раз в день и туда пихай» — туда же, где данные API для газеты). Один на
 * сутки UTC: `pcd_vestnik_paper_<дата>`, те же правила, что у кода выпуска.
 * Только сегодняшний — ключ API не заведёт коды на другие даты.
 */
export async function paperPromo(
  now: number = Date.now(),
): Promise<{ date: string; code: string } | null> {
  const date = new Date(now).toISOString().slice(0, 10);
  const code = await issuePromo(`paper_${date}`);
  return code ? { date, code } : null;
}
