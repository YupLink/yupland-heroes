// Форматирование чисел + подписи валют для админ-панели «Экономика».
//
// Одно место на все четыре вкладки: иначе таблицы разъедутся (в одной 12 300,
// в другой 12 300.4). Клиент отдаёт числа как есть — здесь режем хвост и
// подкладываем иконку.
import { marketResourceIconSrc } from "@/lib/resourceIcons";

/** Универсальный числовой формат: без хвоста нулей, до 2 знаков. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1000) return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);
}

/** Ключ валюты → человеческая подпись. */
export function currencyLabel(key: string): string {
  if (key === "likes") return "Лайки";
  if (key === "tickets") return "Билеты";
  if (key === "energy") return "Энергия";
  if (key === "gold") return "Золото";
  if (key === "stone") return "Камень";
  if (key === "wood") return "Дерево";
  if (key === "diamonds") return "Алмазы";
  if (key.startsWith("token:")) return key.slice("token:".length);
  if (key.startsWith("resource:token:")) return key.slice("resource:token:".length);
  if (key.startsWith("resource:")) return currencyLabel(key.slice("resource:".length));
  if (key.startsWith("custom:name:")) return key.slice("custom:name:".length);
  if (key.startsWith("pack:")) return `Пак ${key.slice("pack:".length).slice(0, 8)}`;
  if (key.startsWith("hero:")) return `Герой ${key.slice("hero:".length).slice(0, 8)}`;
  if (key.startsWith("art:")) return `Арт ${key.slice("art:".length).slice(0, 8)}`;
  if (key.startsWith("boss:")) return `Босс ${key.slice("boss:".length).slice(0, 8)}`;
  return key;
}

/** Иконка валюты — картинка ресурса или пусто. */
export function currencyIcon(key: string): string | null {
  if (key === "likes" || key === "energy") return marketResourceIconSrc(key);
  if (key === "gold" || key === "stone" || key === "wood") return marketResourceIconSrc(key);
  if (key === "diamonds") return marketResourceIconSrc("diamonds");
  if (key.startsWith("resource:")) return currencyIcon(key.slice("resource:".length));
  return null;
}
