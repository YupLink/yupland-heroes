// Единая отрисовка иконки валюты в сводке Экономики.
//
// Приоритет: серверная картинка → lucide-иконка для «известной, но без
// картинки» валюты (билеты, энергия) → пустая плашка. Раньше билет,
// у которого в public/resources ассета нет, рисовался серым квадратом,
// и в столбцах таблицы был неотличим от чего попало.
import type { LucideIcon } from "lucide-react";
import { Ticket, Zap, Heart } from "lucide-react";
import { cn } from "@/lib/utils";

const LUCIDE: Record<string, { Icon: LucideIcon; color: string }> = {
  tickets: { Icon: Ticket, color: "#f5c451" },
  energy: { Icon: Zap, color: "#fbbf24" },
  likes: { Icon: Heart, color: "#ef4444" },
};

export function CurrencyIcon({
  currencyKey,
  image,
  label,
  size = "md",
}: {
  currencyKey: string;
  image: string | null;
  label: string;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-6 w-6" : "h-5 w-5";
  if (image) {
    return <img src={image} alt={label} className={cn(dim, "rounded object-cover")} />;
  }
  const fallback = LUCIDE[currencyKey];
  if (fallback) {
    const { Icon, color } = fallback;
    return (
      <span
        className={cn(dim, "grid place-items-center rounded")}
        style={{ color }}
        aria-label={label}
      >
        <Icon className="h-full w-full" />
      </span>
    );
  }
  return <span className={cn(dim, "rounded bg-secondary")} aria-label={label} title={label} />;
}
