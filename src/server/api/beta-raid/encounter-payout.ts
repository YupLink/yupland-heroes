// Раздача награды за поверженного босса — ПО ТОПУ ВКЛАДА, а не добившему.
//
// Раньше всё забирал тот, кто нанёс последний удар: можно было снести боссу
// 90% здоровья и не получить ничего. Теперь работает так же, как в обычном
// рейде: фонд делится по местам (`split`), паки и предметы уходят первым
// `toPlace` местам. Урон суммируется ПО АККАУНТУ, а не по кошельку —
// сестринские кошельки одного игрока не дают лишних мест.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr, parseRewardConfig } from "../raid-shared";
import { queueEncounterReward } from "./reward-queue";
import type { EncounterTarget } from "./encounter-target";
import { grantedOf, queueAll, type GrantedReward } from "./encounter-rewards";
import type { DropItem } from "./loot-bag/bag-deliver";
import { moneyByPlace } from "./encounter-share";
import { moneyOnly, extraByPlace } from "./encounter-extra";
import { bumpBossKill } from "../achievements/bump";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { islandArtFull, islandCanonExtras, islandDropsFor, islandHunters } from "./island/island-drops";

export type TopRow = { account: string; total: number };

/** Лидерборд по одному объекту: сумма урона, аккаунты не дублируются. */
export async function objectLeaderboard(hpId: string, generation = 0): Promise<TopRow[]> {
  // Считаем только текущую жизнь объекта: и по поколению, и по времени её
  // начала. Оживлённый до появления поколений босс тащил в зачёт урон прошлой
  // жизни — в таблице стояли суммы больше, чем у него вообще снято HP.
  const rows = (await mcpExec(
    `SELECT r.account_id AS account, SUM(r.damage)::bigint AS total,
            min(r.created_at) AS first_at
       FROM yuplink.beta_raid_object_run r
       JOIN yuplink.beta_raid_object_hp h ON h.id = r.hp_id
      WHERE r.hp_id = ${sqlStr(hpId)} AND r.generation = ${Math.max(0, Math.floor(generation))}
        AND (h.life_started_at IS NULL OR r.created_at >= h.life_started_at)
      GROUP BY r.account_id
      ORDER BY total DESC, first_at ASC;`,
    { wrapJson: true },
  )) as Array<{ account: string; total: number | string; first_at: string }>;
  return (rows ?? []).map((r) => ({ account: r.account, total: Number(r.total) || 0 }));
}

/**
 * Один раз на объект в пределах цикла: повторный вызов ничего не раздаст,
 * а возрождённый в новом цикле объект раздаст награду заново.
 */
export async function claimObjectPayout(hpId: string, cycleNo: number): Promise<boolean> {
  const won = (await mcpExec(
    `INSERT INTO yuplink.raid_reward_distributed (scope_key, cycle_no)
     VALUES (${sqlStr(`beta:${hpId}`)}, ${Math.floor(cycleNo) || 0}) ON CONFLICT DO NOTHING
     RETURNING scope_key;`,
    { wrapJsonCte: true },
  )) as Array<{ scope_key: string }>;
  return !!won && won.length > 0;
}

/**
 * Делит фонд по местам и выдаёт награды. Возвращает то, что досталось
 * `viewer` — окно результата боя показывает игроку именно его добычу.
 */
export async function payoutByTop(opts: {
  target: EncounterTarget;
  hpId: string;
  mapId: string;
  cycleNo: number;
  viewer: string;
  /** Клетка босса: что из предметов не влезло в рюкзак — мешочком здесь. */
  q: number;
  r: number;
  /** Поколение объекта — награда числится за текущей жизнью, не за прошлой. */
  generation?: number;
}): Promise<GrantedReward[]> {
  const cfg = parseRewardConfig(opts.target.rewardConfig);
  const lb = await objectLeaderboard(opts.hpId, opts.generation ?? 0);
  if (lb.length === 0) return [];
  if (!(await claimObjectPayout(opts.hpId, opts.generation ?? opts.cycleNo))) return [];
  // Босс острова: «Охотник» читаем до +1 за этого босса (лайки 10–30 → 5–15).
  const island = opts.target.kind === "boss" && isIslandMapId(opts.mapId);
  const hunters = island ? await islandHunters(lb.map((r) => r.account)) : null;
  const artFull = island ? await islandArtFull(lb.map((r) => r.account)) : new Set<string>();
  // Ачивка «Охотник» (§8.57): одна на жизнь босса — каждому, кто его бил.
  bumpBossKill(opts.hpId, opts.generation ?? 0);

  // «Моя добыча»: лидерборд и зритель говорят на одном языке — аккаунтах.
  const { raidOwner } = await import("./owner");
  const me = await raidOwner(opts.viewer);
  const mine: GrantedReward[] = [];
  // Свой товар каждого места — в его рюкзак, остаток мешочком у босса (ниже).
  const items = new Map<string, { row: TopRow; place: number; list: DropItem[] }>();
  // Остальное не начисляем сразу: кладём в очередь получения — игрок заберёт
  // с карты, увидев, за какую цель что причитается.
  const give = async (
    row: TopRow,
    place: number,
    kind: string,
    amount: number,
    packId: string | null,
  ) => {
    if (kind === "custom" && packId) {
      const got = items.get(row.account) ?? { row, place, list: [] };
      got.list.push({ itemId: packId, amount, origin: "mob" });
      items.set(row.account, got);
      return;
    }
    await queueEncounterReward({
      account: row.account,
      mapId: opts.mapId,
      cycleNo: opts.cycleNo,
      sourceName: opts.target.name,
      targetId: opts.target.templateId,
      kind,
      amount,
      packId,
      place,
      damage: row.total,
      // Бой с боссом — добыча с мобов (ПРАВИЛА §8.18).
      origin: "mob",
    }).catch((e) => console.warn(`[beta-payout] ${kind} → ${row.account}:`, e));
    if (row.account === me) mine.push({ kind, amount, packId });
  };

  // Делимое (лайки/билеты/токены/энергия) — по местам плюс равная часть
  // невостребованного: фонд на топ-10 при двух бивших уходил лишь на треть.
  // moneyOnly убирает ресурсы и свои товары: формулы денег остаются ровно
  // теми же, а новые виды считает соседний модуль.
  // Остров обучения — только канон (§8.47, 13.11): мировые деньги шаблона не делим.
  const money = island ? [] : moneyByPlace(moneyOnly(cfg), lb.length);
  for (let i = 0; i < money.length; i++) {
    for (const row of money[i]) await give(lb[i], i + 1, row.kind, row.amount, null);
  }

  // Босс острова (§8.47): лайки, шанс пака, артефакта и золота — каждому бившему.
  if (hunters) {
    for (let i = 0; i < lb.length; i++) {
      for (const d of await islandDropsFor(
        hunters.has(lb[i].account),
        artFull.has(lb[i].account),
      )) {
        await give(lb[i], i + 1, d.kind, d.amount, d.ref);
      }
    }
  }

  // Ресурсы (делятся целыми) и свои товары (штучно, до места N). Ссылка вида
  // едет в той же колонке, что и пак.
  const extras = extraByPlace(cfg, lb.length);
  for (let i = 0; i < extras.length; i++) {
    for (const row of island ? islandCanonExtras(extras[i]) : extras[i]) await give(lb[i], i + 1, row.kind, row.amount, row.ref);
  }

  for (const pk of island ? [] : cfg.packs) {
    if (!pk.packId || pk.toPlace <= 0) continue;
    for (let i = 0; i < Math.min(pk.toPlace, lb.length); i++) {
      await give(lb[i], i + 1, "pack", 1, pk.packId);
    }
  }

  for (const it of island ? [] : (cfg.items ?? [])) {
    if (!it.itemTemplateId || it.toPlace <= 0) continue;
    for (let i = 0; i < Math.min(it.toPlace, lb.length); i++) {
      await give(lb[i], i + 1, "item", 1, it.itemTemplateId);
    }
  }

  // Предметы мест — по три разом: у каждого свой рюкзак и лок, а мост держит не
  // больше 10 запросов на процесс. Место зрителя — первым: ответ ждёт он.
  const places = [...items.values()].sort(
    (a, b) => Number(b.row.account === me) - Number(a.row.account === me),
  );
  for (let i = 0; i < places.length; i += 3) {
    await Promise.all(places.slice(i, i + 3).map((it) => giveItems(opts, it, me, mine)));
  }
  return mine;
}

/**
 * Свой товар места — в рюкзак выбранного героя, что не влезло — мешочком у
 * босса, даже если игрок далеко (владелец, 29.09.2026). Ключ выпадения — жизнь
 * босса и аккаунт: раздача одна на жизнь (claimObjectPayout), повтор моста не
 * уронит второй мешочек. Товара нет в справочнике или мешочек точно не упал —
 * ждёт в «Добыче»; выдача не состоялась вовсе (сбой базы) — всё в «Добычу», как
 * до мешочков: босс уже разделён, откатывать некуда.
 */
async function giveItems(
  opts: {
    target: EncounterTarget;
    hpId: string;
    mapId: string;
    cycleNo: number;
    q: number;
    r: number;
    generation?: number;
  },
  it: { row: TopRow; place: number; list: DropItem[] },
  me: string,
  mine: GrantedReward[],
): Promise<void> {
  const { deliverOrDrop } = await import("./loot-bag/bag-deliver");
  const account = it.row.account;
  const key = `boss:${opts.hpId}:${opts.generation ?? 0}:${account}`;
  const put = (_kind: string, amount: number, packId: string | null, k?: string) =>
    queueEncounterReward({
      account,
      mapId: opts.mapId,
      cycleNo: opts.cycleNo,
      sourceName: opts.target.name,
      targetId: opts.target.templateId,
      kind: "custom",
      amount,
      packId,
      place: it.place,
      damage: it.row.total,
      origin: "mob",
      key: k,
    });
  const got = await deliverOrDrop({
    owner: account,
    account,
    items: it.list,
    at: {
      key,
      mapId: opts.mapId,
      q: opts.q,
      r: opts.r,
      source: "boss",
      sourceName: opts.target.name,
    },
    toQueue: (x, k) => put("custom", x.amount, x.itemId, k),
  }).then(
    (res) => grantedOf(res.items),
    (e) => {
      console.warn(`[beta-payout] предметы → ${account} — в «Добычу»:`, e);
      return queueAll(it.list, put, key);
    },
  );
  if (account === me) mine.push(...got);
}
