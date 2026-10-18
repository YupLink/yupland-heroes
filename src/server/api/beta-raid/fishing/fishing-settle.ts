// Досчёт заброса (ПРАВИЛА §8.35) — ленивый, без тика: созревший заброс
// отыгрывается при чтении состояния (кнопка перечитывает его к сроку), при
// «Забросить», «Хватит» и когда удочку убирают из рук. В забросе столько
// попыток, сколько заказал игрок ползунком минут (plan_tries; у старых строк —
// одна): каждая — рыба с шансом (fishHit от зерна fishing-seed, не от ключа из
// браузера) или ничего; удочка стирается в обоих случаях; конец — «done».
// До какого мига герой точно рыбачил (горизонт):
//  • было другое действие (трата энергии, econ/energy-note) с той же версией
//    позиции — до него, и рыбалка кончается;
//  • сошёл с клетки (другая версия позиции) или сменился выбранный герой — до
//    последнего «видели на месте» (seen_at): когда именно ушёл, неизвестно, и
//    лишнего не выдаём; рыбалка кончается;
//  • иначе — до «сейчас», и «видели на месте» сдвигается сюда.
// Попытку захватывает оператор поимки (fishing-catch-sql: CAS по счётчику
// попыток и износ удочки одним оператором), улов — в рюкзак (fishing-deliver)
// со временем каждой поимки (время её попытки, а не выдачи: турнир «Улов» и
// журнал считают пойманное тогда, когда оно поймано). Удочка кончилась или не
// в руках — рыбалка кончается без попытки. Смена инструмента — fishing-tool-end.
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { pickMainTool } from "@/server/api/beta-raid/main-tool/main-tool";
import { wearStep } from "@/lib/raid/toolWear";
import { bumpAchievement } from "@/server/api/achievements/bump";
import {
  CAST_TRIES,
  IDLE_FISH,
  catchesOf,
  dueCount,
  type FishCatch,
  type FishStop,
  type FishView,
} from "@/lib/raid/fishing";
import { loadFishingConfig } from "@/server/api/beta-raid/fishing/fishing-config";
import { closeSql, touchSql } from "@/server/api/beta-raid/fishing/fishing-sql";
import { fishHorizon, readFishing, tryChance } from "@/server/api/beta-raid/fishing/fishing-row";
import { hitOffsetsAt } from "@/lib/raid/fishChanceSteps";
import {
  catchSql,
  claimSql,
  type CatchRow,
} from "@/server/api/beta-raid/fishing/fishing-catch-sql";
import { catchKey, deliverCatch } from "@/server/api/beta-raid/fishing/fishing-deliver";
import { fishSeed } from "@/server/api/beta-raid/fishing/fishing-seed";

/** Поимок за один оператор и операторов за один заход (остальное — more). */
const BATCH = 50;
const ROUNDS = 4;
/** «Хватит» и смена инструмента дочитывают всё созревшее за один заход. */
const STOP_ROUNDS = 40;

const num = (v: unknown): number => Number(v) || 0;

type Round = {
  hits: number;
  done: number;
  rodName: string;
  end: FishStop | null;
  lost: boolean;
};

/** Один захват: удочка в руках → оператор поимки; ответ потерян — свой захват по ключу. */
async function catchRound(o: {
  account: string;
  heroId: string;
  sid: string;
  tries: number;
  k: number;
  succ: number[];
  intervalMin: number;
  seenMs: number | null;
}): Promise<Round> {
  const { pick, stack } = await pickMainTool(o.heroId, { kind: "rod" });
  const idle = { hits: 0, done: 0 };
  if (!pick.ok)
    return { ...idle, rodName: "", end: pick.why === "idle" ? "tool" : "rod", lost: false };
  const nonce = nanoid(12);
  const rodName = stack?.name ?? "";
  const at = { ...o, rodKey: pick.key, step: wearStep(stack?.toolWear), nonce };
  let row: CatchRow | undefined;
  try {
    row = sqlRow<CatchRow>((await mcpExec(catchSql(at))) as unknown[]);
  } catch (e) {
    const back = ((await mcpExec(claimSql(o.account), { wrapJson: true })) as CatchRow[])?.[0];
    if (back?.claim !== nonce) throw e;
    row = { ...back, hits: 0, done: 0, live: true, main: true, have: true };
  }
  let [hits, done] = [num(row?.hits), num(row?.done)];
  // Свой захват уже прошёл (повтор моста или потерянный ответ): отыграно = tries − C.
  if (done === 0 && hits === 0 && row?.claim === nonce) {
    done = Math.max(0, num(row.tries) - o.tries);
    hits = o.succ.filter((x) => x <= done).length;
  }
  // Продвинулись — дальше решит следующий заход (заброс отыгран — конец «done»);
  // удочка доломалась — следующий заброс возьмёт другую (pickMainTool).
  if (hits > 0 || done > 0) return { hits, done, rodName, end: null, lost: false };
  if (row?.live === false) return { ...idle, rodName, end: null, lost: true };
  return { ...idle, rodName, end: row?.main === false ? "tool" : "rod", lost: false };
}

export type SettleOpts = { account: string; wallet: string; stop?: FishStop };

/** Досчитать рыбалку аккаунта (и закончить — stop); ответ — для кнопки. */
export async function settleFishing(o: SettleOpts): Promise<FishView> {
  const row = await readFishing(o.account);
  if (!row || row.stopped) return IDLE_FISH;
  const cfg = await loadFishingConfig();
  const at = fishHorizon(row, o.stop);
  const valid = at.valid;
  let [horizon, end] = [at.horizon, at.end];
  // Зерно — от аккаунта, ключа и соли заброса; у старых строк без соли — от ключа.
  const seed = fishSeed(o.account, row.op, row.salt);
  const [step, from] = [cfg.intervalMin * 60_000, row.caught + 1];
  // Шанс попытки — по её мигу: зафиксированный при забросе (с бонусом героя),
  // а после срока баффа удачи — без него (ступени строки). У старых строк
  // шанса нет — настройка мира, как было до бонусов.
  const chanceOf = tryChance(row, cfg.chancePct, step);
  // Сколько попыток в этом забросе: заказ игрока, у старых строк — одна.
  const plan = Math.max(1, row.planTries || CAST_TRIES);
  let [tries, caught, nextMs, rodName, more] = [row.tries, row.caught, row.nextMs, "", false];
  let failure: unknown = null;
  const times: number[] = [];
  // Улов не выбран (админ очистил список) — ловить нечего: поимки ждут настройки.
  for (let round = 0; cfg.items.length > 0; round++) {
    // Заброс — одна попытка: дальше игрок забрасывает снова (владелец, 05.10).
    const k = Math.min(dueCount(nextMs, horizon, step, BATCH), plan - tries);
    if (k <= 0) break;
    if (round >= (o.stop ? STOP_ROUNDS : ROUNDS)) {
      more = true;
      break;
    }
    // Где в этих попытках рыба — бросок от зерна и номера: повтор видит то же.
    const succ = hitOffsetsAt(seed, tries + 1, k, chanceOf);
    let r: Round;
    try {
      r = await catchRound({
        account: o.account,
        heroId: row.heroId,
        sid: row.op,
        tries,
        k,
        succ,
        intervalMin: cfg.intervalMin,
        seenMs: valid && end === null ? row.nowMs : null,
      });
    } catch (e) {
      // Исход захвата неизвестен: уже пойманное выдаём, остальное — следующим заходом.
      [failure, more] = [e, true];
      break;
    }
    rodName ||= r.rodName;
    caught += r.hits;
    // Попытка номер x этого захода — в миг nextMs + (x − 1) × шаг (dueCount).
    const hit = succ.filter((x) => x <= r.done).slice(0, r.hits);
    times.push(...hit.map((x) => nextMs + (x - 1) * step));
    tries += r.done;
    nextMs += r.done * step;
    if (r.lost) {
      // Захватил другой заход (вторая вкладка): его улов — его, мы перечитаем.
      more = true;
      break;
    }
    if (r.end) {
      [end, horizon] = [r.end, Math.min(horizon, nextMs)];
      break;
    }
  }
  // Заброс отыгран (с рыбой или без) — рыбалка кончается: ловить — забросить снова.
  if (!end && tries >= plan) [end, horizon] = ["done", Math.min(horizon, nextMs)];
  let got: FishCatch[] = [];
  if (caught > row.caught) {
    got = await deliverCatch({
      wallet: o.wallet,
      account: o.account,
      mapId: row.mapId,
      q: row.q,
      r: row.r,
      key: catchKey(o.account, row.op, from),
      rodName,
      times,
      items: catchesOf(cfg.items, seed, from, caught - row.caught),
    });
    // Ачивка «Рыбак» (§8.57): рыба этого захода — счётчик в базе уже сдвинут.
    bumpAchievement(o.account, "fisher", caught - row.caught);
  }
  // «Хватит» не прошёл до конца — отказ кнопке (выданное уже выдано), рыбалка идёт.
  if (failure && o.stop === "stop") throw failure;
  // Попыток не было, а удочки в руках уже нет (продал, выбросил, убрал) — конец
  // сейчас: до этого мига ничего не созрело, и «ловящей» кнопки без удочки нет.
  if (!end && !more && valid && tries === row.tries) {
    const { pick } = await pickMainTool(row.heroId, { kind: "rod" }).catch(() => ({ pick: null }));
    if (pick && !pick.ok) end = pick.why === "idle" ? "tool" : "rod";
  }
  if (end && !more) {
    // «Хватит» обязан закончить — сбой отдаём кнопке; прочие причины найдёт и следующий заход.
    const close = mcpExec(closeSql(o.account, row.op, end, horizon), { wrapJsonCte: true });
    await (o.stop === "stop" ? close : close.catch(() => []));
  } else if (valid && tries === row.tries && end === null) {
    await mcpExec(touchSql(o.account, row.op, row.nowMs)).catch(() => []);
  }
  const fishing = !end || more;
  return {
    fishing,
    q: fishing ? row.q : null,
    r: fishing ? row.r : null,
    caught,
    tries,
    plan,
    nextInMs: fishing ? Math.max(0, nextMs - row.nowMs) : null,
    got,
    more,
    // Заброс отыгран раньше, а конец тогда не записался — о нём уже сказано.
    ended: fishing || (end === "done" && tries === row.tries) ? null : end,
  };
}
