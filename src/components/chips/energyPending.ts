// Оплата энергии «в пути»: между подписью транзакции и начислением энергии.
//
// Игрок платит on-chain, серверный вызов может не докрутить (закрыл окно,
// сорвалась сеть) — энергия тогда приходит только с крон-догоном.
//
// ⚠️ Урок 25.08: блокировать покупку из-за такой записи ОПАСНЕЕ, чем не
// блокировать. Запись пережила неудачный вызов, кнопки во всех паках остались
// выключенными со спиннером — со стороны игрока «оплата просто грузится и не
// открывает кошелёк». Поэтому запись живёт МИНУТЫ и только предупреждает,
// а покупку не запирает.
import type { QueryClient } from "@tanstack/react-query";

export const PENDING_KEY = ["energy-payment-pending"] as const;
const STORAGE_KEY = "gd_energy_pending";

export type EnergyPendingPay = {
  packId: string;
  txHash: string;
  /** Чем платили — для подписи в интерфейсе. */
  label: string;
  /** Когда подписали, мс. */
  at: number;
};

/**
 * Сколько ждём зачисления, прежде чем перестать считать оплату «в пути».
 * Дальше её всё равно добьёт крон, а игроку нельзя мешать играть.
 */
export const PENDING_TTL_MS = 3 * 60 * 1000;

export function readPendingPay(): EnergyPendingPay | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as EnergyPendingPay;
    if (!p?.txHash || !p?.packId) return null;
    if (Date.now() - (p.at ?? 0) > PENDING_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

function write(p: EnergyPendingPay | null) {
  if (typeof localStorage === "undefined") return;
  try {
    if (p) localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* приватный режим — переживём */
  }
}

/** Запомнить подписанную оплату: игрок увидит плашку «зачисляем». */
export function startPendingPay(qc: QueryClient, p: Omit<EnergyPendingPay, "at">) {
  const full: EnergyPendingPay = { ...p, at: Date.now() };
  write(full);
  qc.setQueryData(PENDING_KEY, full);
}

/** Оплата закрыта — плашку убираем. */
export function clearPendingPay(qc: QueryClient) {
  write(null);
  qc.setQueryData(PENDING_KEY, null);
}
