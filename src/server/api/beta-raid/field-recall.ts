// Снять СВОЕГО героя с грядки из любого места карты — бесплатно, но с отдыхом.
//
// Правило владельца (29.09.2026; 27.09 было «за 10 000 DARAI»). Жалоба 27.09:
// легендарный воин батрачит на грядке за воротами «+30», основным стал торговец
// 20-го уровня — к грядке ему не пройти, а воина не вернуть. Теперь снять можно
// отовсюду даром, а платит сам герой: FIELD_RECALL_REST_MS отдыха — серый,
// никуда не ставится и ничего не делает (hero-rest.ts).
//
// Порядок: ключ нажатия → проверки → снятие.
//   • без отдыха, как раньше, — стоя у самой грядки (как в её окне) и когда
//     грядки больше нет (снесли, сбросили тир, стёрли настройку): туда не дойти,
//     и наказывать героя не за что;
//   • снятие — общее с бесплатным (field-leave): CAS «этот герой → никто», и
//     отдых ложится тем же оператором — снят значит отдыхает, и наоборот;
//     был основным — перестаёт им быть (отдыхающим не ходят и не дерутся);
//   • не сняли (герой уже свободен, сорвалась база) — ключ нажатия отпускаем:
//     то же нажатие вправе пройти заново.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { accAccountId } from "../currency/move";
import { leaveFieldWork, leftByKey } from "./field-leave";
import { settleFieldPayout } from "./field-settle";
import { loadCellBuilding } from "./building-action";
import { myMapId, ownCell } from "./encounter-where";
import { claimRecallOp, newRecallMark, recallKey, releaseRecallOp } from "./field-recall-op";
import { isBuilt } from "@/lib/buildingEffect";
import { parseFieldConfig, type FieldConfig } from "@/lib/fieldConfig";
import { FIELD_RECALL_REST_MS } from "@/lib/fieldRecall";
import { hexDistance } from "@/lib/raid/hex";
import { publishRaid } from "../../raidLive";

type Work = { mapId: string; q: number; r: number; name: string };

export type FieldRecallResult = {
  ok: true;
  /** Повтор уже обработанного нажатия: второй раз ничего не сделано. */
  repeat: boolean;
  /** Ушёл ли герой отдыхать: у самой грядки и с грядки, которой нет, — нет. */
  rested: boolean;
  heroName: string | null;
  /** Грядка, с которой сняли, — клиенту перечитать её окно. */
  at: { q: number; r: number } | null;
};

/** Где батрачит герой. Не мой — отказ; свободен — null. */
async function workOf(account: string, heroId: string): Promise<Work | null> {
  const rows = (await mcpExec(
    `SELECT h.account_id AS owner, COALESCE(NULLIF(t.name, ''), 'Герой') AS name,
            w.map_id, w.q, w.r
       FROM yuplink.hero_instance h
       LEFT JOIN yuplink.mystic_item_template t ON t.id = h.template_id
       LEFT JOIN yuplink.raid_field_worker w
              ON w.hero_id = h.id AND w.account_id = ${sqlStr(account)}
      WHERE h.id = ${sqlStr(heroId)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{
    owner: string | null;
    name: string;
    map_id: string | null;
    q: number | null;
    r: number | null;
  }>;
  const row = rows?.[0];
  if (!row || row.owner !== account) throw new Error("braid.field_recall_not_yours");
  if (!row.map_id || row.q === null || row.r === null) return null;
  return { mapId: row.map_id, q: Number(row.q), r: Number(row.r), name: row.name };
}

/** Конфиг живой грядки. null — грядки больше нет: снятие без отдыха. */
async function fieldCfgOf(w: Work): Promise<FieldConfig | null> {
  const b = await loadCellBuilding(w.mapId, w.q, w.r);
  if (!b || b.effect !== "field" || !isBuilt(b.tier, b.tiers.length)) return null;
  return parseFieldConfig(b.config) ?? parseFieldConfig(b.meta);
}

/** Игрок у самой грядки (рядом или на ней) — как в её окне, без отдыха. */
async function nearField(wallet: string, w: Work): Promise<boolean> {
  const [mapId, pos] = await Promise.all([myMapId(wallet), ownCell(wallet)]);
  return mapId === w.mapId && !!pos && hexDistance(pos.q, pos.r, w.q, w.r) <= 1;
}

export const recallHeroFromField = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        heroId: z.string().min(1).max(120),
        /** Ключ нажатия (newOpId): повтор того же запроса не снимет второй раз. */
        op: z.string().regex(/^[a-z0-9]{6,80}$/i),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<FieldRecallResult> => {
    const wallet = await requireBetaRaid();
    const account = await accAccountId(wallet);
    if (!account) throw new Error("Нужен аккаунт — привяжи Telegram");
    const work = await workOf(account, data.heroId);

    // Ключ нажатия — с аккаунтом: op присылает клиент (ПРАВИЛА 13б).
    const key = recallKey(account, data.op);
    const mark = newRecallMark();
    if (!(await claimRecallOp(key, mark))) {
      // То же нажатие уже обработано (или идёт прямо сейчас).
      return { ok: true, repeat: true, rested: false, heroName: null, at: null };
    }
    // Не сняли — ключ отпускаем: то же нажатие вправе пройти заново.
    const refuse = async (e: unknown): Promise<never> => {
      await releaseRecallOp(key, mark);
      throw e;
    };
    if (!work) return refuse(new Error("braid.field_recall_free"));

    let cfg: FieldConfig | null = null;
    let rested = false;
    try {
      cfg = await fieldCfgOf(work);
      rested = !!cfg && !(await nearField(wallet, work));
    } catch (e) {
      return refuse(e);
    }

    let removed: boolean;
    try {
      // Как окно грядки рядом: целые единицы — на склад, чтобы к снятию остался
      // только дробный хвост (он остаётся в строке работника, §8.16).
      if (cfg) await settleFieldPayout(work.mapId, work.q, work.r, cfg).catch(() => {});
      const { mapId, q, r } = work;
      const restMs = rested ? FIELD_RECALL_REST_MS : 0;
      const leave = { wallet, account, mapId, q, r, cfg, heroId: data.heroId, key, restMs };
      removed = (await leaveFieldWork(leave)).removed;
    } catch (e) {
      console.error("[field-recall] снятие сорвалось:", data.heroId, e);
      // Ответ мог потеряться уже ПОСЛЕ снятия: свой ключ в журнале — значит
      // сняли, и отдых лёг тем же оператором.
      removed = (await leftByKey(key).catch(() => null)) !== null;
      if (!removed) return refuse(new Error("braid.field_recall_retry"));
    }
    // Героя сняли раньше нас (рядом с грядкой или вторым нажатием).
    if (!removed) return refuse(new Error("braid.field_recall_free"));
    if (rested) {
      // Отдыхающий мог быть основным — кэш силы героя (15 с) держал бы его.
      // Сбой здесь снятия не отменяет: кэш сам истечёт через 15 секунд.
      await import("./hero-power")
        .then((m) => m.invalidateHeroPower(wallet))
        .catch((e) => console.warn("[field-recall] кэш силы героя не сброшен:", e));
    }
    try {
      publishRaid({ mapId: work.mapId, type: "built", cells: [`${work.q},${work.r}`] });
    } catch (e) {
      console.warn("[field-recall] событие карты не ушло:", e);
    }
    return { ok: true, repeat: false, rested, heroName: work.name, at: { q: work.q, r: work.r } };
  });
