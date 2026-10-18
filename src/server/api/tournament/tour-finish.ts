// Финиш турнира — по таймеру (tour-tick) и по «Остановить» в админке: путь один.
//
// Порядок: захват (идущий → выплата) → последняя подтяжка очков → места →
// подарки призовым местам → DARAI незанятых мест в пул → «готово».
//
// Ничья (владелец, 06.10.2026): равные по счёту стоят на одном месте k и
// делят призы мест k..k+n−1 поровну (tieShare); остаток DARAI — в пул.
//
// Каждый шаг можно повторить без вреда: места пишутся один раз целиком,
// подарок — с ключом повтора 'tour:<id>:<место>:<n>' (в ничьей — ещё
// ':<аккаунт>'; сгоревший не выдаётся заново), возврат в пул — по UNIQUE ref
// 'tour-left:<id>'. Поэтому упавший на середине финиш тикер просто доделывает
// (status = 'paying').
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { createGifts, type NewGift } from "../gifts-create";
import { insertPoolMove } from "../darai-pools-move";
import { parsePlaces, placeDarai } from "@/lib/tournament/places";
import { prizesNote } from "@/lib/tournament/prizeText";
import { groupByPlace, tieShare, type TieGroup } from "@/lib/tournament/tieShare";
import type { TourBand } from "@/lib/tournament/types";
import { parseBands } from "./tour-rows";
import { dropTourCache } from "./tour-note";
import { resolveArtRarity } from "./tour-art";
import { loadTourWork, syncTournament } from "./tour-sync";
import { settleResourceTail } from "@/server/api/tournament/tour-res-tail";
import { lateLockSql } from "@/server/api/tournament/tour-sql";
import {
  baseRef,
  claimSql,
  doneSql,
  giftRef,
  givenSql,
  placesSql,
  prizePlacesSql,
  tieGiftRef,
} from "./tour-finish-sql";

/** Сколько подарков пишем одним INSERT — как массовая раздача (gifts-admin). */
const GIFT_CHUNK = 100;

export type FinishResult = { ok: boolean; gifts: number; leftDarai: number };

/** Последнее призовое место по строкам призов. */
export const lastPrizePlace = (bands: readonly TourBand[]): number =>
  bands.reduce((m, b) => Math.max(m, parsePlaces(b.places)?.to ?? 0), 0);

type Winner = { place: number; account_id: string };

/**
 * Подарки призовым местам: по одному на приз, без уже выданных. Равные на
 * месте k получают каждый свою долю (tieShare) с ключом, где есть аккаунт.
 */
export function buildGifts(o: {
  id: string;
  name: string;
  bands: readonly TourBand[];
  winners: readonly Winner[];
  given: ReadonlySet<string>;
}): NewGift[] {
  const out: NewGift[] = [];
  for (const g of groupByPlace(o.winners)) {
    const { prizes } = tieShare(o.bands, g.place, g.accounts.length);
    const note = prizesNote(prizes);
    const tie = g.accounts.length > 1;
    for (const account of g.accounts) {
      prizes.forEach((p, n) => {
        const ref = tie ? tieGiftRef(o.id, g.place, n, account) : giftRef(o.id, g.place, n);
        if (o.given.has(ref) || !(Number(p.amount) > 0)) return;
        out.push({
          accountId: account,
          kind: p.kind,
          amount: Number(p.amount),
          refId: p.refId ?? null,
          title: `Турнир «${o.name}»: ${g.place} место`,
          image: p.image ?? null,
          note,
          sourceRef: ref,
          createdBy: "tournament",
        });
      });
    }
  }
  return out;
}

/**
 * DARAI назад в пул: призовые места, которые никто не занял, и остаток
 * деления в ничьей. Группа на месте k занимает места k..k+n−1.
 */
export function leftDarai(bands: readonly TourBand[], groups: readonly TieGroup[]): number {
  const taken = new Set<number>();
  let sum = 0;
  for (const g of groups) {
    const n = g.accounts.length;
    for (let p = g.place; p < g.place + n; p++) taken.add(p);
    sum += tieShare(bands, g.place, n).leftDarai;
  }
  for (const b of bands) {
    const r = parsePlaces(b.places);
    if (!r) continue;
    for (let p = r.from; p <= r.to; p++) if (!taken.has(p)) sum += placeDarai(bands, p);
  }
  return Math.round(sum * 1e8) / 1e8;
}

/**
 * Захватить выплату. Не захватили — продолжаем, только если разрешено
 * подхватить уже идущую (takeOver): так тикер доделывает выплату, зависшую
 * дольше 10 минут. Без захвата больше никто не идёт — два воркера, считающие
 * места наперегонки, — лишний риск; ноль строк от нашего же потерянного ответа
 * (слепой повтор моста) доделает тот же тикер.
 */
async function claim(id: string, takeOver: boolean): Promise<boolean> {
  const rows = (await mcpExec(claimSql(id), { wrapJsonCte: true })) as Array<{ id: string }>;
  if (rows?.[0]) return true;
  if (!takeOver) return false;
  const now = (await mcpExec(
    `SELECT status FROM yuplink.tournament WHERE id = ${sqlStr(id)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ status: string }>;
  return now?.[0]?.status === "paying";
}

/**
 * Завершить турнир: итоги на текущий момент и призы подарком. Повтор
 * безопасен. ok=false — турнир не идёт и не выплачивается (черновик, готов).
 */
export async function finishTournament(
  id: string,
  opts: { takeOver?: boolean } = {},
): Promise<FinishResult> {
  if (!(await claim(id, opts.takeOver === true))) return { ok: false, gifts: 0, leftDarai: 0 };
  dropTourCache();

  // Последняя подтяжка: окно уже закрыто концом (ends_at ≤ now). Потом —
  // добытое в турнире, но не собранное к концу (шахты, «Добыча»).
  const work = await loadTourWork(id);
  if (work) {
    await syncTournament(work);
    await settleResourceTail(work);
    // «Улов»: клюнувшее до конца, но не легшее очками к финишу (выдача
    // ленивая) — досчёт по забросам, до мест (beta-raid/fishing/fishing-tail).
    if (work.metric === "fish_catch") {
      const { settleFishTail } = await import("@/server/api/beta-raid/fishing/fishing-tail-run");
      await settleFishTail(work);
    }
  }

  // Места — под замком поздних очков категории (tour-sql.lateLockSql): позднее
  // очко улова ляжет либо до мест и в них, либо не ляжет вовсе.
  await mcpExec(`${work ? lateLockSql(work.metric) : ""}${placesSql(id)}`);

  const head = (await mcpExec(
    `SELECT name, bands, dry FROM yuplink.tournament WHERE id = ${sqlStr(id)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ name: string; bands: unknown; dry: boolean | null }>;
  const name = String(head?.[0]?.name ?? "");
  const bands = parseBands(head?.[0]?.bands);
  // Проверка: места посчитаны и записаны, но призов нет и пул не трогаем —
  // брони у проверки не было. Не прочли признак — считаем проверкой.
  if (head?.[0]?.dry !== false) {
    await mcpExec(doneSql(id), { wrapJsonCte: true });
    dropTourCache();
    return { ok: true, gifts: 0, leftDarai: 0 };
  }

  const winners = ((await mcpExec(prizePlacesSql(id, lastPrizePlace(bands)), {
    wrapJson: true,
  })) ?? []) as Winner[];
  const givenRows = ((await mcpExec(givenSql(id), { wrapJson: true })) ?? []) as Array<{
    source_ref: string;
  }>;
  const given = new Set(givenRows.map((r) => baseRef(String(r.source_ref))));

  // Артефакт по редкости → конкретный артефакт (детерминированно по ключу подарка).
  const gifts = await resolveArtRarity(buildGifts({ id, name, bands, winners, given }));
  for (let i = 0; i < gifts.length; i += GIFT_CHUNK) {
    await createGifts(gifts.slice(i, i + GIFT_CHUNK), { notify: true });
  }

  const left = leftDarai(bands, groupByPlace(winners));
  if (left > 0) {
    await insertPoolMove({
      kind: "map_release",
      amount: left,
      ref: `tour-left:${id}`,
      note: `Турнир «${name}»: DARAI незанятых мест`,
    });
  }

  await mcpExec(doneSql(id), { wrapJsonCte: true });
  dropTourCache();
  return { ok: true, gifts: gifts.length, leftDarai: left };
}
