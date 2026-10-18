// Забыть заклинание из книги героя — эффектом «Забвение» (правило владельца
// 27.09.2026, модель — lib/hero/boostOblivion.ts).
//
// Всё одним оператором под локом аккаунта (oblivion-sql.ts): герой обязан быть
// своим, строка книги уходит только при живом эффекте, заряд тратится только
// следом за ней и по порядку правила 28.09: безлимит на время — ничего; иначе
// заряд со сроком (истёкший не в счёт); иначе вечный. Поэтому:
//   • два нажатия на последнем заряде — забыто ровно одно, второе видит ноль;
//   • слепой повтор моста строку книги уже не найдёт — второй заряд цел;
//   • откат (hero_spell_cd) не трогается: «забыл → выучил» ждёт его же.
import { mcpExec } from "@/server/db/mcpClient";
import { raidOwner } from "@/server/api/beta-raid/owner";
import { spellHero } from "@/server/api/beta-raid/spell-book";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { oblivionForgetSql } from "@/server/api/beta-raid/oblivion-sql";
import { spellbookSlots } from "@/lib/hero/spellbookSlots";
import type { LearnResult } from "@/server/api/beta-raid/spell-learn";

type ForgetRow = {
  own: boolean;
  rarity: string | null;
  spec: string | null;
  inbook: boolean;
  timed: boolean;
  /** Заряд, который тратится этим забвением (со сроком или вечный); 0 — нет. */
  level: number | string;
  gone: number | string;
  used: number | string;
};

export async function forgetByOblivion(
  wallet: string,
  data: { spellId: string; heroId?: string },
): Promise<LearnResult> {
  const heroId = data.heroId ?? (await spellHero(wallet))?.heroId ?? null;
  if (!heroId) return { ok: false, reasonKey: "spell.no_hero" };
  const account = await raidOwner(wallet);
  const rows = (await mcpExec(oblivionForgetSql(account, heroId, data.spellId), {
    wrapJson: false,
  })) as unknown[];
  const row = sqlRow<ForgetRow>(rows);
  // Героя нет у этого аккаунта — книгу не трогали.
  if (!row?.own) return { ok: false, reasonKey: "spell.hero_unavailable" };
  const gone = Number(row.gone) || 0;
  const used = Number(row.used) || 0;
  const slots = (n: number) => ({
    total: spellbookSlots({ spec: row.spec, rarity: row.rarity }),
    used: Math.max(0, n),
  });
  if (gone > 0)
    return { ok: true, repeat: false, spellId: data.spellId, slots: slots(used - gone) };
  // Заклинания в книге уже нет — «забыто», как игрок и просил: так отвечает
  // и повтор моста после удачного удаления (эффект к этому мигу мог кончиться).
  if (!row.inbook) return { ok: true, repeat: true, spellId: data.spellId, slots: slots(used) };
  const level = Number(row.level) || 0;
  if (!row.timed && level <= 0) return { ok: false, reasonKey: "oblivion.need" };
  // Эффект есть, но строку увёл соседний запрос (столб) — тратить было нечего.
  return { ok: true, repeat: true, spellId: data.spellId, slots: slots(used - 1) };
}
