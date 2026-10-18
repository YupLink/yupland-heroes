// Подписи и числа окна «Купить энергию»: способ оплаты, цена, склонения.
// Числа — в локали игрока.
import type { PayOpt } from "./energyOffers";

export function plural(n: number, ru: boolean, one: string, few: string, many: string, en: string): string {
  if (!ru) return en;
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a >= 11 && a <= 14) return many;
  return b === 1 ? one : b >= 2 && b <= 4 ? few : many;
}

export const num = (n: number, ru: boolean) =>
  new Intl.NumberFormat(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 4 }).format(n);

export const energyWord = (ru: boolean) => (ru ? "энергии" : "energy");
export const boxesWord = (n: number, ru: boolean) => plural(n, ru, "бокс", "бокса", "боксов", n === 1 ? "box" : "boxes");

/** Имя токена на кнопке: DARAI в макете пишется «DarAi». */
export const tokenName = (token: string) => (token === "Darai" ? "DarAi" : token);

export function methodName(o: PayOpt, ru: boolean): string {
  if (o.method === "stars") return ru ? "Stars из Казны" : "Stars from Treasury";
  if (o.method === "tickets") return ru ? "Билеты" : "Tickets";
  if (o.method === "likes") return ru ? "Лайки" : "Likes";
  return tokenName(o.token);
}

/** Цена целиком: «593 ★», «5 билетов», «0,1 USDT». */
export function priceText(o: PayOpt, ru: boolean): string {
  const n = num(o.price, ru);
  if (o.method === "stars") return `${n} ★`;
  if (o.method === "tickets") return `${n} ${plural(o.price, ru, "билет", "билета", "билетов", "tickets")}`;
  if (o.method === "likes") return `${n} ${plural(o.price, ru, "лайк", "лайка", "лайков", "likes")}`;
  return `${n} ${tokenName(o.token)}`;
}

/** DARAI у тарифа — сотни миллионов: «12,8 млн» / «12.8M». */
export function compactDarai(n: number, ru: boolean): string {
  if (n < 1_000_000) return num(Math.round(n), ru);
  const m = new Intl.NumberFormat(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 1 }).format(n / 1_000_000);
  return ru ? `${m} млн` : `${m}M`;
}

/** Значок тарифа: младший — одна молния, старший — корона, середина — две. */
export const tierGlyph = (i: number, n: number) => (n <= 1 ? 0 : i === n - 1 ? 2 : i === 0 ? 0 : 1);
