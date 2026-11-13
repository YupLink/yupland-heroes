// Генератор артефактов (§8.122): заказ, продвижение рисования, возврат цены.
// Рисует та же цепочка, что лаборатория (lab-run): бросок при заказе и не
// меняется, задание продвигает окно игрока (аренда — один обработчик).
//
// Деньги (по образцу «Забвения»): ключ нажатия занимается ДО оплаты — из двух
// одинаковых запросов платит один; плата под ключом задания (keyed); задание не
// легло — цена назад сразу. Не вышло (попытки, сутки в очереди) — цена назад
// сама, один раз (art-gen-sql.claimRefund).
import { nanoid } from "nanoid";
import { randomInt } from "node:crypto";
import { myMapId, playerCell, requireAdjacent } from "@/server/api/beta-raid/encounter-where";
import { requireNotVoid } from "@/server/api/beta-raid/voidGate";
import { loadCellBuilding } from "@/server/api/beta-raid/building-action";
import { raidOwner } from "@/server/api/beta-raid/owner";
import { payResources, refundResources } from "@/server/api/beta-raid/resource-pay";
import { isBuilt } from "@/lib/buildingEffect";
import { ART_GEN_EFFECT, artGenConfigOf, type ArtGenConfig } from "@/lib/artGen/artGenConfig";
import type { CraftRarity } from "@/lib/craft/craftTable";
import { rollCraft } from "@/lib/craft/craftRoll";
import { CRAFT_FORMS, formById } from "@/lib/craft/craftForms";
import { cleanWords, lookWords, readWords } from "@/lib/craft/craftWords";
import { craftName, craftPrompt } from "@/lib/craft/craftPrompt";
import { expireJobs } from "@/server/api/craft/lab-sql";
import { stepPrice } from "@/lib/artGen/artGenStep";
import {
  claimGenOp,
  claimRefund,
  failedUnrefunded,
  genGate,
  genPayRef,
  insertGenJob,
  jobIdByNonce,
} from "./art-gen-sql";
import { loadGenJob, type GenJobView } from "./art-gen-view";

export const PAY = { kind: "artgen", refundKind: "artgen_refund", keyed: true } as const;

/** Генератор у клетки: стоит рядом, постройка — генератор, достроена; настройка клетки. */
export async function genAt(
  wallet: string,
  q: number,
  r: number,
): Promise<{ mapId: string; cfg: ArtGenConfig }> {
  const mapId = await myMapId(wallet);
  requireAdjacent(await playerCell(wallet), q, r);
  await requireNotVoid(wallet, mapId, q, r);
  const b = await loadCellBuilding(mapId, q, r);
  if (!b || b.effect !== ART_GEN_EFFECT) throw new Error("artgen.not_here");
  if (!isBuilt(b.tier, b.tiers.length)) throw new Error("artgen.unbuilt");
  return { mapId, cfg: artGenConfigOf(b.config, b.meta) };
}

async function viewOf(account: string, id: string): Promise<GenJobView> {
  const job = await loadGenJob(account, id);
  if (!job) throw new Error("artgen.not_found");
  return job;
}

export async function orderArtGen(
  wallet: string,
  d: { q: number; r: number; rarity: CraftRarity; words: string; op: string; step: number },
): Promise<GenJobView> {
  const { mapId, cfg } = await genAt(wallet, d.q, d.r);
  const base = cfg.prices[d.rarity];
  // Цены редкости нет — не продаётся: пустая цена не значит «даром».
  if (!base.length) throw new Error("artgen.no_price");
  const account = await raidOwner(wallet);
  // Повтор того же «Создать» после ответа — то же задание.
  const prior = await jobIdByNonce(account, d.op);
  if (prior) return viewOf(account, prior);
  const gate = await genGate(account);
  if (gate.limit || gate.step === null) throw new Error(`artgen.${gate.limit ?? "day_limit"}`);
  // Окно показывало другую цену (успел лечь заказ или прошли сутки) — до оплаты отказ,
  // окно перечитает цену: списываем не больше, чем игрок видел на кнопке.
  if (gate.step !== d.step) throw new Error("artgen.price_changed");
  // Цена — с надбавкой за заказы подряд (artGenStep): её и списываем, её и вернём.
  const prices = stepPrice(base, gate.step);
  if (!(await claimGenOp(d.op, account, nanoid(12)))) throw new Error("artgen.repeat");
  // 18+ и мат — не отказ, а полный рандом (как в лаборатории, §8.81).
  const words = cleanWords(d.words) ?? "";
  const wish = readWords(words);
  const rng = (n: number) => randomInt(n);
  const form = (wish.form && formById(wish.form)) || CRAFT_FORMS[rng(CRAFT_FORMS.length)];
  const roll = rollCraft(d.rarity, wish.boost, rng);
  const id = nanoid(12);
  const ref = genPayRef(id);
  await payResources(wallet, prices, ref, PAY);
  const job = {
    id,
    account,
    wallet,
    nonce: d.op,
    rarity: d.rarity,
    slot: form.slot,
    form: form.id,
    boost: wish.boost,
    roll,
    name: craftName(form, d.rarity, roll),
    prompt: craftPrompt(form, d.rarity, roll, lookWords(words)),
    mapId,
    q: d.q,
    r: d.r,
    paid: prices,
    last: gate.last,
  };
  const put = await insertGenJob(job).catch(() => false);
  if (!put) {
    // Задание не легло — плата этого нажатия назад.
    await refundResources(wallet, prices, ref, PAY);
    throw new Error("artgen.failed_order");
  }
  return viewOf(account, id);
}

/** Не вышедшие задания аккаунта — цена назад, один раз на задание. */
export async function refundFailed(account: string): Promise<void> {
  await expireJobs(account).catch(() => undefined);
  for (const row of await failedUnrefunded(account)) {
    if (!(await claimRefund(row.id, nanoid(12)))) continue;
    await refundResources(row.wallet, row.paid, genPayRef(row.id), PAY);
  }
}

/** Шаг рисования своего задания; не вышло — сразу возврат. */
export async function tickArtGen(wallet: string, id: string): Promise<GenJobView> {
  const account = await raidOwner(wallet);
  const job = await viewOf(account, id);
  if (job.status === "queued" && Date.parse(job.nextAt) <= Date.now()) {
    const { advanceJob } = await import("@/server/api/craft/lab-run");
    await advanceJob({ wallet, account }, id);
  }
  await refundFailed(account);
  return (await loadGenJob(account, id)) ?? job;
}
