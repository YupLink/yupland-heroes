// Забыть заклинание У СТОЛБА — за «Цену забвения» из его настройки (как до 27.09).
//
// Порядок «сначала деньги, потом товар» (ПРАВИЛА 8.7), как у алтаря:
// ключ нажатия → проверки → оплата → строка книги → не ушла — деньги назад.
// Ключ нажатия после оплаты не отпускаем даже при возврате: повтор того же
// нажатия прошёл бы по уже возвращённой оплате даром (списания коротко
// замыкаются по ключу, res_move/acc_move его второй раз не проводят).
//
// Строка книги уходит одним оператором (pillarForgetSql): герой обязан быть
// своим, а ключ «забыто этим нажатием» ложится в raid_backpack_op тем же
// оператором. Так слепой повтор моста (строки уже нет, ключ есть — оплачено и
// сделано) не путается с «строки и не было» (ключа нет — вернуть деньги).
// «0 строк» — ещё не «строки не было»: свой ключ ищем и отдельным чтением
// (снимок оператора берётся до лока, как у грядки §8.16).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { raidOwner } from "@/server/api/beta-raid/owner";
import { claimBoostOp } from "@/server/api/beta-raid/hero-boost";
import { payResources, refundResources } from "@/server/api/beta-raid/resource-pay";
import { noteEnergyInPrices } from "@/server/api/beta-raid/econ/trade-hooks";
import { learnedSpellIds, spellHero } from "@/server/api/beta-raid/spell-book";
import { requirePillar } from "@/server/api/beta-raid/spell-pillar";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { opMarked } from "@/server/api/beta-raid/oblivion";
import { pillarForgetSql } from "@/server/api/beta-raid/spell-forget-sql";
import { spellbookSlots } from "@/lib/hero/spellbookSlots";
import type { LearnResult } from "@/server/api/beta-raid/spell-learn";

/** Мой ли герой и сколько у него мест в книге. Чужой/нет — null. */
async function ownHero(account: string, heroId: string) {
  const rows = (await mcpExec(
    `SELECT h.rarity, t.specialization AS spec
       FROM yuplink.hero_instance h
       LEFT JOIN yuplink.mystic_item_template t ON t.id = h.template_id
      WHERE h.id = ${sqlStr(heroId)} AND h.account_id = ${sqlStr(account)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ rarity: string | null; spec: string | null }>;
  return rows?.[0] ?? null;
}

/**
 * Строка книги ушла этим нажатием? «Нет» и сбой базы перепроверяем ключом
 * отдельным чтением: ключ ложится тем же оператором, что и удаление.
 */
async function forgetRow(account: string, heroId: string, spellId: string, mark: string) {
  try {
    const sql = pillarForgetSql(account, heroId, spellId, mark);
    const row = sqlRow<{ was: boolean; gone: number | string }>(
      (await mcpExec(sql, { wrapJson: false })) as unknown[],
    );
    if (row && (row.was === true || Number(row.gone) > 0)) return true;
  } catch (e) {
    console.error("[spell-forget] строка книги не ушла:", heroId, spellId, e);
  }
  // Прочитать не вышло — деньги назад (ПРАВИЛА 8.7).
  return opMarked(mark).catch(() => false);
}

export async function forgetAtPillar(
  wallet: string,
  data: { spellId: string; heroId?: string; q: number; r: number; op: string },
): Promise<LearnResult> {
  const gate = await requirePillar(wallet, data.q, data.r);
  if ("reasonKey" in gate) return { ok: false, reasonKey: gate.reasonKey };
  // Цены забвения нет — этот столб забывать НЕ УМЕЕТ. Пустой список значил бы
  // пустой цикл оплаты, то есть даровое забвение.
  const prices = gate.cfg.forgetPrices;
  if (prices.length === 0) return { ok: false, reasonKey: "spell.pillar_no_forget" };

  const heroId = data.heroId ?? (await spellHero(wallet))?.heroId ?? null;
  if (!heroId) return { ok: false, reasonKey: "spell.no_hero" };
  const account = await raidOwner(wallet);
  const [hero, known] = await Promise.all([ownHero(account, heroId), learnedSpellIds(heroId)]);
  if (!hero) return { ok: false, reasonKey: "spell.hero_unavailable" };
  const total = spellbookSlots({ spec: hero.spec, rarity: hero.rarity });
  const slots = { total, used: Math.max(0, known.length - 1) };
  if (!known.includes(data.spellId)) return { ok: false, reasonKey: "spell.not_in_book" };

  // Ключ нажатия — ДО денег: повтор того же op не платит и не забывает снова.
  const fresh = await claimBoostOp({
    op: data.op,
    heroId,
    stat: "int",
    amount: 0,
    source: `spell_forget:${data.spellId}`,
  });
  if (!fresh) return { ok: true, repeat: true, spellId: data.spellId, slots };

  const ref = `spell_forget:${data.op}`;
  try {
    await payResources(wallet, prices, ref);
    void noteEnergyInPrices(wallet, prices, "spell");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reasonKey: "spell.pay_failed", reasonParams: { msg } };
  }

  if (!(await forgetRow(account, heroId, data.spellId, `sforget:${data.op}`))) {
    // Строку увёл соседний запрос (второе нажатие, книга с эффектом) — платить
    // было не за что. Ключ нажатия не отпускаем: оплата по нему уже возвращена.
    await refundResources(wallet, prices, ref);
    return { ok: false, reasonKey: "spell.not_in_book" };
  }
  return { ok: true, repeat: false, spellId: data.spellId, slots };
}
