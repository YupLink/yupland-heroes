// Строка круга NFT: разбор из базы и id, выведенные из перевода. Общая для
// nft-cycle.ts (хранение) и nft-cycle-claim.ts (решение) — без взаимного импорта.
import type { CycleBinding, CycleRow } from "@/lib/nftCycle";

export type DbRow = {
  id: string;
  token_id?: string;
  opened_at: string;
  open_source: string;
  closed_at: string | null;
  close_tx: string | null;
  chip_id: string | null;
  serial_no: number | null;
  template_id: string | null;
  level: number | string | null;
  collection_id: string | null;
  grant_ids?: unknown;
};

/**
 * Id, выведенный из самого перевода: повтор той же выдачи (сбой посередине,
 * повтор транспортом, догон после кнопки) попадает в ту же строку, а не
 * заводит вторую. На нём держится идемпотентность неявного круга и фишки.
 */
export async function stableId(prefix: string, ...parts: string[]): Promise<string> {
  // Web Crypto, а не node:crypto: модуль попадает в граф клиентской сборки
  // через серверные функции, и импорт модуля узла ронял бандл браузера.
  const buf = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(parts.join("|")),
  );
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${prefix}${b64.slice(0, 12)}`;
}

/** Id фишки, которую выдаёт круг за перевод, — один и тот же при любом повторе. */
export const ownChipId = async (cycleId: string, txHash: string): Promise<string> =>
  (await stableId("uci_", cycleId, txHash)).slice(0, 14);

const ms = (v: string | null | undefined): number | null => {
  const n = v ? Date.parse(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
export const iso = (m: number): string => new Date(m).toISOString();

export function toCycle(r: DbRow): CycleRow {
  const binding: CycleBinding | null =
    r.template_id && r.collection_id
      ? {
          chipId: r.chip_id,
          serial: r.serial_no == null ? null : Number(r.serial_no),
          templateId: r.template_id,
          level: Number(r.level ?? 1),
          collectionId: r.collection_id,
        }
      : null;
  return {
    id: r.id,
    openedAt: ms(r.opened_at) ?? 0,
    openSource: r.open_source,
    closedAt: ms(r.closed_at),
    closeTx: r.close_tx,
    binding,
    granted: r.grant_ids != null,
  };
}

/** Строка круга из JSON (row_to_json) — как её отдаёт база. */
export function parseCur(v: unknown): CycleRow | null {
  if (!v) return null;
  const o = (typeof v === "string" ? JSON.parse(v) : v) as DbRow;
  return o?.id ? toCycle(o) : null;
}
