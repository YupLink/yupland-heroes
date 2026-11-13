// ИЗУЧИТЬ заклинание у столба. ЗАБЫТЬ — у столба за «Цену забвения» или из
// книги эффектом «Забвение» (ручка forgetSpell здесь же, чтобы у клиентов
// прежней сборки не сменился её адрес; вся логика — spell-forget.ts).
//
// ⚠️ КЛЮЧ НАЖАТИЯ, а не пара (герой, заклинание). Прежде ключом оплаты была
// пара, и «выучил → забыл → выучил» второй раз проходил БЕСПЛАТНО: списание
// короткозамыкается по (kind, ref) — res_move/acc_move на знакомом ключе
// возвращают applied=false и денег не берут. Хуже того, цена из двух строк со
// сбоем на второй откатывала первую ключом `…:back` и ВЫДАВАЛА золото, которого
// не брали. Теперь ключ разовый: его присылает клиент (op), как у алтаря
// (boost-action.ts), и он же держит идемпотентность — журнал нажатий
// (claimBoostOp) отсекает слепой повтор моста.
//
// Порядок оплаты обратный касту и намеренно такой: сначала МЕСТО В КНИГЕ,
// потом деньги. Не прошла оплата — строку убираем, книга остаётся прежней.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { claimBoostOp, releaseBoostOp } from "./hero-boost";
import { payResources } from "./resource-pay";
import { noteEnergyInPrices } from "./econ/trade-hooks";
import { learnedSpellIds, spellHero } from "./spell-book";
import { loadSpellTemplates } from "./spell-tpl";
import { requirePillar } from "./spell-pillar";
import { forgetInput, forgetSpellFor } from "./spell-forget";
import { spellbookSlots } from "@/lib/hero/spellbookSlots";

export type LearnResult =
  | { ok: true; repeat: boolean; spellId: string; slots: { total: number; used: number } }
  | { ok: false; reasonKey: string; reasonParams?: Record<string, string | number> };

const spellInput = (d: unknown) =>
  z
    .object({
      q: z.number().int(),
      r: z.number().int(),
      spellId: z.string().min(1).max(120),
      /** Ключ нажатия: он же ключ оплаты и защита от слепого повтора моста. */
      op: z.string().min(6).max(80),
    })
    .parse(d);

const payFailed = (e: unknown): LearnResult => ({
  ok: false,
  reasonKey: "spell.pay_failed",
  reasonParams: { msg: e instanceof Error ? e.message : String(e) },
});

/**
 * Вставить строку книги, но только если МЕСТО ЕСТЬ — счёт занятых считает сама
 * база в том же операторе. Раньше вместимость читалась одним запросом, а
 * писалась другим, и два нажатия на разные заклинания проходили проверку
 * одновременно: книга перерастала лимит.
 *
 * Отдаём и факт вставки, и число занятых ДО неё: по нему видно, почему вставки
 * не случилось — мест нет или заклинание уже в книге.
 */
async function insertSpellRow(
  heroId: string,
  spellId: string,
  total: number,
): Promise<{ inserted: boolean; usedBefore: number }> {
  const rows = (await mcpExec(
    `WITH ins AS (
       INSERT INTO yuplink.hero_spellbook (hero_id, spell_id, learned_at)
       SELECT ${sqlStr(heroId)}, ${sqlStr(spellId)}, now()
        WHERE (SELECT count(*) FROM yuplink.hero_spellbook
                WHERE hero_id = ${sqlStr(heroId)}) < ${Math.max(0, Math.floor(total))}
       ON CONFLICT ON CONSTRAINT hero_spellbook_pk DO NOTHING
       RETURNING spell_id
     )
     SELECT (SELECT count(*) FROM ins)::int AS ins,
            (SELECT count(*) FROM yuplink.hero_spellbook
              WHERE hero_id = ${sqlStr(heroId)})::int AS used;`,
    { wrapJson: false },
  )) as Array<{ ins: number; used: number }>;
  const row = rows?.[0];
  return { inserted: Number(row?.ins) > 0, usedBefore: Number(row?.used) || 0 };
}

/** Убрать строку книги: оплата не прошла, изучения не было. */
async function deleteSpellRow(heroId: string, spellId: string): Promise<void> {
  await mcpExec(
    `DELETE FROM yuplink.hero_spellbook
      WHERE hero_id = ${sqlStr(heroId)} AND spell_id = ${sqlStr(spellId)};`,
  ).catch((e) => console.error("[spell] строка книги не убралась:", heroId, spellId, e));
}

/** Выучить заклинание: место в книге, потом деньги. */
export const learnSpell = createServerFn({ method: "POST" })
  .inputValidator(spellInput)
  .handler(async ({ data }): Promise<LearnResult> => {
    const wallet = await requireBetaRaid();
    const gate = await requirePillar(wallet, data.q, data.r);
    if ("reasonKey" in gate) return { ok: false, reasonKey: gate.reasonKey };
    if (gate.cfg.spells.length > 0 && !gate.cfg.spells.includes(data.spellId)) {
      return { ok: false, reasonKey: "spell.unknown" };
    }

    const hero = await spellHero(wallet);
    if (!hero) return { ok: false, reasonKey: "spell.no_hero" };
    const [tpl] = await loadSpellTemplates({ ids: [data.spellId] });
    if (!tpl) return { ok: false, reasonKey: "spell.unknown" };

    const known = await learnedSpellIds(hero.heroId);
    const total = spellbookSlots({ spec: hero.spec, rarity: hero.rarity });
    if (known.includes(tpl.id)) return { ok: false, reasonKey: "spell.already_learned" };
    // req_int сторожит и вход в книгу, и каст: поумневший герой заклинание
    // выучит, поглупевший — не прочтёт, но и потерять выученное не должен.
    if (hero.intellect < tpl.minInt)
      return { ok: false, reasonKey: "spell.low_int", reasonParams: { need: tpl.minInt } };
    if (known.length >= total)
      return { ok: false, reasonKey: "spell.no_slots", reasonParams: { total } };

    // Ключ нажатия занимаем ДО всего: повтор того же `op` ничего не платит и
    // ничего не пишет, а читает уже случившееся.
    const islandProgress = gate.mapId.startsWith("isle_") ? await import("./island/island-spell-progress") : null;
    const islandSource = islandProgress ? await islandProgress.islandPillarSource(wallet, {
      mapId: gate.mapId, q: data.q, r: data.r, spellId: tpl.id, prices: gate.cfg.learnPrices,
    }) : null;
    const fresh = await claimBoostOp({
      op: data.op,
      heroId: hero.heroId,
      stat: "int",
      amount: 0,
      source: islandSource ?? `spell_learn:${tpl.id}`,
    });
    if (!fresh) {
      return { ok: true, repeat: true, spellId: tpl.id, slots: { total, used: known.length } };
    }

    const row = await insertSpellRow(hero.heroId, tpl.id, total);
    if (!row.inserted) {
      // Гонка с соседним нажатием: либо место кто-то занял, либо это же
      // заклинание уже легло в книгу. Ключ отпускаем — платить не за что.
      await releaseBoostOp(data.op);
      return row.usedBefore >= total
        ? { ok: false, reasonKey: "spell.no_slots", reasonParams: { total } }
        : { ok: false, reasonKey: "spell.already_learned" };
    }

    try {
      await payResources(wallet, gate.cfg.learnPrices, `spell_learn:${data.op}`, islandSource ? { keyed: true } : undefined);
      void noteEnergyInPrices(wallet, gate.cfg.learnPrices, "spell");
    } catch (e) {
      await deleteSpellRow(hero.heroId, tpl.id);
      await releaseBoostOp(data.op);
      return payFailed(e);
    }
    if (gate.mapId.startsWith("isle_")) {
      // A guide failure must never turn a completed purchase into a failed one.
      await import("./island/island-spell-progress")
        .then(({ noteIslandPillarLearn }) => noteIslandPillarLearn(wallet, gate.mapId, data.q, data.r, hero.heroId, tpl.id, data.op))
        .catch((e) => console.warn("[island] pillar progress:", e));
    }
    return {
      ok: true,
      repeat: false,
      spellId: tpl.id,
      slots: { total, used: row.usedBefore + 1 },
    };
  });

/**
 * Забыть заклинание: у столба (пришла клетка) — за его «Цену забвения», из
 * книги — только при эффекте «Забвение» (spell-forget.ts). Место
 * освобождается, откат — нет (он герою и наказание).
 */
export const forgetSpell = createServerFn({ method: "POST" })
  .inputValidator(forgetInput)
  .handler(async ({ data }): Promise<LearnResult> => forgetSpellFor(await requireBetaRaid(), data));

