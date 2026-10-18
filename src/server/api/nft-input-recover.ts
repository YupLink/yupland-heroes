// Догон сирот ввода NFT: скан → отсев выданного → выдача.
//
// Устройство простое и одинаковое для всех входов (крон, экран владельца,
// самолечение при открытии игры): список кандидатов → пачкой спросили, что уже
// выдано → оставшимся определили, что положено → выдали.
//
// Сухой прогон (dryRun) проходит те же шаги и НИЧЕГО не выдаёт: им безопасно
// смотреть на боевые данные и им же живёт список сирот в админке.
import { recoveryOrder } from "@/lib/nftCycle";
import { creditStatuses, creditKey } from "./nft-cycle-read";
import { createClassifyContext, classifyCandidate } from "./nft-input-classify";
import { deliverCandidate } from "./nft-input-deliver";
import { OLD_TRANSFER_NOTE } from "./nft-cycle-credit";
import { scanStoreIncoming, type InputCandidate } from "./nft-input-scan";

export type RecoverRow = {
  contract: string;
  tokenId: string;
  txHash: string;
  wallet: string;
  title: string;
  at: string | null;
  kind: "pack" | "chip" | null;
  /** Что положено выдать (или почему нечего). */
  plan: string;
  /** candidate — сухой прогон; остальное — исход выдачи. */
  status: "candidate" | "granted" | "already" | "skipped" | "busy" | "failed";
  detail: string;
  /** Сколько предметов реально выдано этой строкой (боксов или фишек). */
  items: number;
};

export type RecoverSummary = {
  scanned: number;
  alreadyDelivered: number;
  orphans: number;
  granted: number;
  packs: number;
  chips: number;
  skipped: number;
  busy: number;
  failed: number;
};

export type RecoverResult = { summary: RecoverSummary; rows: RecoverRow[] };

const MAX_PER_RUN = 60;

export function emptySummary(): RecoverSummary {
  return {
    scanned: 0,
    alreadyDelivered: 0,
    orphans: 0,
    granted: 0,
    packs: 0,
    chips: 0,
    skipped: 0,
    busy: 0,
    failed: 0,
  };
}

/**
 * Сироты: переводы, по которым круг NFT ещё должен выдать (новый круг или
 * доделка прерванной выдачи), без выданного вне кругов. Без времени перевода
 * круг не найти — такие разбираются руками и в догон не идут. Порядок — свежие
 * номера первыми (recoveryOrder): прогон берёт только голову списка.
 */
export async function findOrphans(
  list: InputCandidate[],
): Promise<{ todo: InputCandidate[]; old: InputCandidate[] }> {
  const known = list.filter(
    (c): c is InputCandidate & { atMs: number } => c.atMs != null && !!c.txHash,
  );
  if (known.length === 0) return { todo: [], old: [] };
  const statuses = await creditStatuses(
    known.map((c) => ({ contract: c.contract, tokenId: c.tokenId, txHash: c.txHash, atMs: c.atMs })),
  );
  const state = (c: InputCandidate) => statuses.get(creditKey(c))?.state;
  return {
    todo: recoveryOrder(known.filter((c) => state(c) === "todo")),
    // Старше кругов и кругам неизвестны: сами не выдаём (см. beforeCycles).
    old: known.filter((c) => state(c) === "old"),
  };
}

function iso(at: number | null): string | null {
  return at == null ? null : new Date(at).toISOString();
}

/**
 * Основной проход. `only` сужает выдачу до одного вида — так крон сохраняет два
 * прежних счётчика (паки и фишки), не сканируя дважды: скан кэширован.
 */
export async function recoverCandidates(
  list: InputCandidate[],
  opts?: { dryRun?: boolean; only?: "pack" | "chip"; max?: number },
): Promise<RecoverResult> {
  const summary = emptySummary();
  summary.scanned = list.length;
  const rows: RecoverRow[] = [];
  if (list.length === 0) return { summary, rows };

  const { todo: orphans, old } = await findOrphans(list);
  // Без времени и старше кругов — не «выданные», а «на разбор»: пропуск со
  // строкой, чтобы кнопка «догнать сейчас» не отвечала пустотой.
  const untimed = list.filter((c) => c.atMs == null || !c.txHash);
  summary.alreadyDelivered = list.length - orphans.length - untimed.length - old.length;
  summary.skipped += untimed.length + old.length;
  summary.orphans = orphans.length;
  const manual = (c: InputCandidate, plan: string, detail: string) =>
    rows.push({
      contract: c.contract,
      tokenId: c.tokenId,
      txHash: c.txHash,
      wallet: c.wallet,
      title: c.title,
      at: iso(c.atMs),
      kind: null,
      plan,
      status: "skipped",
      detail,
      items: 0,
    });
  for (const c of untimed) {
    manual(c, "время перевода в сети не найдено", "без времени перевода круг не найти — разобрать руками");
  }
  for (const c of old) manual(c, "перевод до учёта кругами", OLD_TRANSFER_NOTE);

  const ctx = await createClassifyContext();
  const queue = orphans.slice(0, opts?.max ?? MAX_PER_RUN);

  for (const c of queue) {
    const cls = await classifyCandidate(c, ctx);
    const kind = cls.kind === "none" ? null : cls.kind;
    const plan =
      cls.kind === "pack"
        ? `${cls.grantCount}× ${cls.packName}`
        : cls.kind === "chip"
          ? `фишка ${cls.identity.level}★${cls.bound ? " (выведенная — вернётся с тем же номером)" : " (по названию)"}`
          : cls.reason;

    const base = {
      contract: c.contract,
      tokenId: c.tokenId,
      txHash: c.txHash,
      wallet: c.wallet,
      title: c.title,
      at: iso(c.atMs),
      kind,
      plan,
    };

    if (cls.kind === "none") {
      summary.skipped++;
      rows.push({ ...base, status: "skipped", detail: cls.reason, items: 0 });
      continue;
    }
    if (opts?.only && cls.kind !== opts.only) {
      // Не наш вид в этом прогоне — не «пропуск ошибки», а разделение труда.
      rows.push({ ...base, status: "candidate", detail: "ждёт своего прогона", items: 0 });
      continue;
    }
    if (opts?.dryRun) {
      rows.push({
        ...base,
        status: "candidate",
        detail: "сухой прогон: выдача не делалась",
        items: cls.kind === "pack" ? cls.grantCount : 1,
      });
      continue;
    }

    const out = await deliverCandidate(c, cls);
    rows.push({
      ...base,
      status: out.status,
      detail: out.detail,
      items: out.status === "granted" ? out.ids.length : 0,
    });
    if (out.status === "granted") {
      summary.granted++;
      if (out.kind === "pack") summary.packs++;
      else summary.chips++;
    } else if (out.status === "already") summary.alreadyDelivered++;
    else if (out.status === "skipped") summary.skipped++;
    else if (out.status === "busy") summary.busy++;
    else if (out.status === "failed") summary.failed++;
  }
  return { summary, rows };
}

/** Общая лента склада — путь крона. */
export async function recoverStore(opts?: {
  dryRun?: boolean;
  only?: "pack" | "chip";
  maxAgeMs?: number;
}): Promise<RecoverResult> {
  const list = await scanStoreIncoming({ maxAgeMs: opts?.maxAgeMs });
  return recoverCandidates(list, { dryRun: opts?.dryRun, only: opts?.only });
}
