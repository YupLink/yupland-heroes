// КАСТ заклинания: проверки, энергия, эффекты, откат.
//
// Устроено как «использовать товар-буст» (boost-item.ts), только вместо
// съеденной штуки списывается энергия и ставится откат. Порядок такой же
// жёсткий, и он не декоративный:
//   1. ключ нажатия (claimBoostOp) — слепой повтор моста не должен кастовать
//      дважды за одну кнопку;
//   2. откат занимается ОДНИМ оператором (CAS): двое одновременных нажатий
//      обязаны разойтись «первый скастовал / второй ждёт», а не оба;
//   3. энергия — последней проверкой перед делом, атомарным списанием
//      (touch_energy_atomic). В МИНУС не уходим никогда: не хватило — отказ,
//      откат отпускается назад, ключ нажатия снимается;
//   4. эффекты; сорвались — энергия возвращается (refund), откат снимается.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { payForHit } from "./encounter-pay";
import { claimBoostOp, releaseBoostOp } from "./hero-boost";
import { invalidateHeroPower } from "./hero-power";
import { applySpellEffects, type SpellRoll } from "./spell-effects";
import { castRefusal, cooldownLeftSec, spellHero } from "./spell-book";
import { readyAtOf, restoreCooldown, takeCooldown } from "./spell-cooldown";
import { loadSpellTemplate, spellCostFor, type SpellKind } from "./spell-tpl";
import { myMapId, type Cell } from "./encounter-where";
import { energyMultOf, scaleEnergy } from "@/lib/raid/island/energy";

export type CastRefused = {
  ok: false;
  reasonKey: string;
  reasonParams?: Record<string, string | number>;
};

export type CastDone = {
  ok: true;
  /** Повтор того же нажатия: ничего не списано и не начислено второй раз. */
  repeat: boolean;
  spellId: string;
  name: string;
  kind: SpellKind;
  rolls: SpellRoll[];
  /** Сколько энергии ушло (со скидкой от интеллекта). */
  spent: number;
  cooldownMinutes: number;
  readyAt: string | null;
  /** Куда переехал герой и куда пришёл корабль — у технических заклинаний. */
  moved: Cell | null;
  ship: { id: string; q: number; r: number } | null;
  /** Телепорт домой из другого мира: новая карта — клиент перекачивает её. */
  map: string | null;
};

export type CastResult = CastDone | CastRefused;

/** Знает ли ЭТОТ герой это заклинание. Книга у каждого героя своя. */
async function knowsSpell(heroId: string, spellId: string): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT 1 AS ok FROM yuplink.hero_spellbook
      WHERE hero_id = ${sqlStr(heroId)} AND spell_id = ${sqlStr(spellId)} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ ok: number }>;
  return (rows?.length ?? 0) > 0;
}

export const castSpell = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        spellId: z.string().min(1).max(120),
        /** Ключ нажатия: слепой повтор моста не должен кастовать дважды. */
        op: z.string().min(6).max(80),
        /** Цена, которую показала кнопка. Дороже неё не списываем. Дробная — остров (×0,1). */
        expect: z.number().min(0).max(1_000_000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<CastResult> => {
    const wallet = await requireBetaRaid();
    // Книга и откат — оба на КОНКРЕТНОМ герое: разные герои независимы.
    // Карта — ради цены: на острове заклинание в 10 раз дешевле. Не узнали —
    // цена мировая, как было (книга при сбое покажет так же).
    const [hero, tpl, mapId] = await Promise.all([
      spellHero(wallet),
      loadSpellTemplate(data.spellId),
      myMapId(wallet).catch(() => null),
    ]);
    if (!hero) return { ok: false, reasonKey: "spell.no_hero" };
    if (!tpl || !tpl.active) return { ok: false, reasonKey: "spell.unknown" };
    if (!(await knowsSpell(hero.heroId, tpl.id)))
      return { ok: false, reasonKey: "spell.not_learned" };

    const full = spellCostFor(tpl, hero.intellect);
    const cost = { ...full, energy: scaleEnergy(full.energy, energyMultOf(mapId)) };
    // Интеллект проверяем до всего остального: это правило шаблона, а не
    // состояние игрока, и отказ по нему не должен трогать ни ключ, ни откат.
    const gate = castRefusal(tpl, hero, 0);
    if (gate) return { ok: false, ...gate };
    // Кнопка считала цену по снимку книги, сервер — по ТЕКУЩЕМУ интеллекту.
    // Между открытием книги и нажатием мог истечь буст, и списалось бы больше,
    // чем обещала плитка. Дороже обещанного не берём: отказ, книга перечитается
    // и покажет новую цену. Дешевле — берём молча, это подарок игроку.
    if (typeof data.expect === "number" && cost.energy > data.expect) {
      return {
        ok: false,
        reasonKey: "spell.price_changed",
        reasonParams: { cost: cost.energy },
      };
    }

    const fresh = await claimBoostOp({
      op: data.op,
      heroId: hero.heroId,
      stat: tpl.effects[0]?.stat ?? "int",
      amount: cost.energy,
      source: `spell:${tpl.id}`,
    });
    if (!fresh) {
      // Повтор нажатия: каст уже состоялся, второй раз не платим и не вешаем.
      return {
        ok: true,
        repeat: true,
        spellId: tpl.id,
        name: tpl.name,
        kind: tpl.kind,
        rolls: [],
        spent: 0,
        cooldownMinutes: cost.cooldownMinutes,
        readyAt: await readyAtOf(hero.heroId, tpl.id),
        moved: null,
        map: null,
        ship: null,
      };
    }

    const cd = await takeCooldown(hero.heroId, tpl.id, cost.cooldownMinutes);
    if (!cd.taken) {
      await releaseBoostOp(data.op);
      return {
        ok: false,
        reasonKey: "spell.cooldown",
        reasonParams: { sec: cooldownLeftSec(cd.prev?.readyAt) },
      };
    }

    // Энергия — последней: списание атомарное, в минус база не пускает.
    let pay: { refund: () => Promise<void> };
    try {
      pay = await payForHit(wallet, cost.energy, "spell");
    } catch (e) {
      await Promise.all([restoreCooldown(hero.heroId, tpl.id, cd.prev), releaseBoostOp(data.op)]);
      // payForHit говорит о нехватке своей фразой; всё прочее — беда базы, и
      // прятать её за «не хватает энергии» нельзя.
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.startsWith("Нужно")) throw e;
      return { ok: false, reasonKey: "spell.no_energy", reasonParams: { cost: cost.energy } };
    }

    const applied = await applySpellEffects(wallet, tpl).catch((e): CastRefused => {
      console.error("[spell] применение сорвалось:", tpl.id, e);
      return { ok: false, reasonKey: "spell.failed" };
    });
    if (!applied.ok) {
      // Не вышло — возвращаем всё: энергию, откат и ключ нажатия.
      await Promise.all([
        pay.refund(),
        restoreCooldown(hero.heroId, tpl.id, cd.prev),
        releaseBoostOp(data.op),
      ]);
      return applied;
    }

    // Статы изменились — сбрасываем кэш силы героя, иначе бой ещё 15 секунд
    // считал бы по прежним числам.
    invalidateHeroPower(wallet);
    return {
      ok: true,
      repeat: false,
      spellId: tpl.id,
      name: tpl.name,
      kind: tpl.kind,
      rolls: applied.rolls,
      spent: cost.energy,
      cooldownMinutes: cost.cooldownMinutes,
      readyAt: cost.cooldownMinutes > 0 ? cd.readyAt : null,
      moved: applied.moved,
      ship: applied.ship,
      map: applied.map ?? null,
    };
  });
