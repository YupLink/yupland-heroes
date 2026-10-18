// Университет: положить фишки на стейкинг, забрать их, забрать лайки.
//
// Правила ТЗ, которые здесь и живут:
//   • фишки в стейкинге не воюют — им ставится статус 'staked', а весь боевой
//     код отбирает фишки по 'owned', так что новых проверок не понадобилось;
//   • забрать фишки и лайки можно в ЛЮБОМ университете, но дойти до него надо
//     ногами (university-gate);
//   • множитель берётся у здания, где игрок КЛЕЙМИТ, а не где положил фишки.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId } from "./encounter-where";
import { getSisterWallets } from "../user";
import { accAccountId } from "../currency/move";
import { universityAt } from "./university-gate";
import {
  settleUniversity,
  universityAccount,
  claimUniversity,
  addUniversitySlot,
  slotPrice,
  syncSlotsFromMining,
} from "./university-state";
import { chipLikesPerDay, UNI_MAX_SLOTS } from "@/lib/university";

const cell = (d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d);
const cellChips = (d: unknown) =>
  z
    .object({
      q: z.number().int(),
      r: z.number().int(),
      chipIds: z.array(z.string().min(1)).min(1).max(50),
    })
    .parse(d);

/** Кому принадлежит стейк и на какой кошелёк идут лайки. */
async function who(wallet: string) {
  const [account, sisters, mapId] = await Promise.all([
    accAccountId(wallet),
    getSisterWallets(wallet),
    myMapId(wallet),
  ]);
  if (!account) throw new Error("Нет игрового счёта");
  return { account, sisters, mapId };
}

/** Что показать в окне университета. */
export const getUniversity = createServerFn({ method: "GET" })
  .inputValidator(cell)
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const { account, sisters, mapId } = await who(wallet);
    const here = await universityAt(wallet, mapId, data.q, data.r);
    // Места, купленные в прежнем стейкинге, переносятся сюда: университет —
    // продолжение той же механики, и терять вложенные билеты не за что.
    await settleUniversity(account);
    await syncSlotsFromMining(account, wallet).catch(() => {});
    const acc = await universityAccount(account);

    // Свободные фишки — те, что сейчас можно положить. Список короткий по
    // построению: в бой и на маркет уходят те же 'owned'.
    const free = (await mcpExec(
      `SELECT c.id, c.level, c.serial_no, t.name, t.image_url
         FROM yuplink.user_chip_inventory c
         LEFT JOIN yuplink.chip_templates t ON t.id = c.template_id
        WHERE c.account_id = ${sqlStr(account)} AND c.status = 'owned'
        ORDER BY c.level DESC, c.id LIMIT 200;`,
      { wrapJson: true },
    )) as Array<{
      id: string;
      level: number;
      serial_no: number | null;
      name: string | null;
      image_url: string | null;
    }>;

    return {
      here,
      slots: acc.slots,
      /** Цена следующего места в билетах; null — расширять больше некуда. */
      slotPrice: slotPrice(acc.slots),
      maxSlots: UNI_MAX_SLOTS,
      /** Когда игрок последний раз забирал лайки — окно считает по нему кулдаун. */
      claimedAtMs: acc.claimedAtMs,
      pending: acc.pending,
      lifetime: acc.lifetime,
      ratePerDay: acc.ratePerDay,
      staked: acc.chips,
      free: (free ?? []).map((c) => ({
        chipId: String(c.id),
        level: Number(c.level),
        name: c.name ?? "",
        imageUrl: c.image_url ?? null,
        serialNo: c.serial_no === null ? null : Number(c.serial_no),
        ratePerDay: chipLikesPerDay(Number(c.level)),
      })),
    };
  });

/** Оставить фишки в университете. */
export const stakeUniversityChips = createServerFn({ method: "POST" })
  .inputValidator(cellChips)
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const { account, sisters, mapId } = await who(wallet);
    await universityAt(wallet, mapId, data.q, data.r);
    // Пересчёт ДО смены состава: иначе новая фишка получит доход за время,
    // когда её здесь не было.
    await settleUniversity(account);

    // Мест ограниченное число: учиться могут не все фишки разом. Считаем ДО
    // записи — иначе фишка успела бы уйти в стейк, а потом «не поместиться».
    const acc = await universityAccount(account);
    const free = acc.slots - acc.chips.length;
    if (free <= 0) throw new Error("Все места заняты — открой ещё одно");
    if (data.chipIds.length > free) {
      throw new Error(`Свободных мест: ${free} — выбери столько же фишек`);
    }

    const ids = data.chipIds.map(sqlStr).join(",");
    // Замок и проверка владения — одним оператором: фишка уходит в стейк,
    // только пока она свободна и правда наша.
    const taken = (await mcpExec(
      `UPDATE yuplink.user_chip_inventory c
          SET status = 'staked', updated_at = now()
        WHERE c.id IN (${ids}) AND c.status = 'owned'
          AND c.account_id = ${sqlStr(account)}
       RETURNING c.id, c.level, c.wallet;`,
      { wrapJsonCte: true },
    )) as Array<{ id: string; level: number; wallet: string }>;
    if (!taken?.length) throw new Error("Эти фишки уже заняты");

    const values = taken
      .map(
        (c) =>
          `(${sqlStr(c.id)}, ${sqlStr(account)}, ${sqlStr(c.wallet)}, ${Number(c.level)}, ${chipLikesPerDay(Number(c.level))}, now())`,
      )
      .join(",");
    await mcpExec(
      `INSERT INTO yuplink.chip_university_stake
         (chip_id, account_id, wallet, level, rate_per_day, staked_at)
       VALUES ${values}
       ON CONFLICT (chip_id) DO NOTHING;`,
    );
    return { staked: taken.length };
  });

/** Забрать фишки со стейкинга — в любом университете. */
export const unstakeUniversityChips = createServerFn({ method: "POST" })
  .inputValidator(cellChips)
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const { account, mapId } = await who(wallet);
    await universityAt(wallet, mapId, data.q, data.r);
    // Тот же порядок: сначала досчитать заработанное, потом менять состав.
    await settleUniversity(account);

    const ids = data.chipIds.map(sqlStr).join(",");
    const back = (await mcpExec(
      `DELETE FROM yuplink.chip_university_stake s
        WHERE s.chip_id IN (${ids}) AND s.account_id = ${sqlStr(account)}
       RETURNING s.chip_id;`,
      { wrapJsonCte: true },
    )) as Array<{ chip_id: string }>;
    if (!back?.length) throw new Error("Этих фишек здесь нет");

    await mcpExec(
      `UPDATE yuplink.user_chip_inventory
          SET status = 'owned', updated_at = now()
        WHERE id IN (${back.map((b) => sqlStr(String(b.chip_id))).join(",")})
          AND status = 'staked';`,
    );
    return { unstaked: back.length };
  });

/** Забрать накопленные лайки — по множителю ЭТОГО университета. */
export const claimUniversityLikes = createServerFn({ method: "POST" })
  .inputValidator(cell)
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const { account, mapId } = await who(wallet);
    const here = await universityAt(wallet, mapId, data.q, data.r);
    // Лайки идут на КАНОНИЧЕСКИЙ кошелёк аккаунта: иначе баланс растащит по
    // сестринским кошелькам — на этом уже обжигался майнинг.
    const { miningCanonicalWallet } = await import("../chips-mint-helpers-mining");
    const canon = await miningCanonicalWallet(wallet);
    const minted = await claimUniversity({ accountId: account, wallet: canon, bonus: here.bonus });
    if (minted <= 0) {
      // Могло быть две причины: реально пусто или ещё не остыл кулдаун. Обе
      // читаются одним взглядом на аккаунт после клейма.
      const after = await universityAccount(account);
      const { UNI_CLAIM_COOLDOWN_MS } = await import("@/lib/university");
      const left = after.claimedAtMs ? UNI_CLAIM_COOLDOWN_MS - (Date.now() - after.claimedAtMs) : 0;
      if (left > 0) {
        const min = Math.max(1, Math.ceil(left / 60_000));
        throw new Error(`Клейм раз в 4 часа. Осталось ${min} мин.`);
      }
      throw new Error("Пока нечего забирать");
    }
    return { likes: minted, level: here.level, bonus: here.bonus };
  });

/** Открыть ещё одно место под обучение — за билеты. */
export const buyUniversitySlot = createServerFn({ method: "POST" })
  .inputValidator(cell)
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const { account, mapId } = await who(wallet);
    await universityAt(wallet, mapId, data.q, data.r);
    await settleUniversity(account);

    const acc = await universityAccount(account);
    const price = slotPrice(acc.slots);
    if (price === null) throw new Error("Все места уже открыты");

    // Сначала деньги: билеты списываются идемпотентно по номеру места, поэтому
    // повтор запроса не снимет их дважды. Место добавляется следом и тоже
    // условно — на пределе оно просто не откроется, а билеты вернутся.
    const { moveTickets } = await import("../tickets-ledger");
    const slotRef = `uni-slot:${account}:${acc.slots + 1}`;
    const paid = await moveTickets({
      wallet,
      delta: -price,
      kind: "university_slot",
      ref: slotRef,
    });
    // Ключ повтора одноразовый: если билеты не списались (не хватило или ключ
    // уже израсходован прошлой попыткой), место открывать нельзя — иначе оно
    // достанется бесплатно.
    if (!paid.applied) throw new Error("Не хватило билетов");
    try {
      const slots = await addUniversitySlot(account);
      return { slots, paid: price, next: slotPrice(slots) };
    } catch (e) {
      await moveTickets({
        wallet,
        delta: price,
        kind: "refund",
        ref: `uni-slot-undo:${account}:${acc.slots + 1}`,
      }).catch(() => {});
      // Возврат гасит и ключ списания: иначе повтор покупки того же места
      // упирался бы в израсходованный ключ и открывал место без оплаты.
      await mcpExec(
        `DELETE FROM yuplink.ticket_move
          WHERE kind = 'university_slot' AND ref = ${sqlStr(slotRef)}`,
      ).catch(() => undefined);
      throw e;
    }
  });
