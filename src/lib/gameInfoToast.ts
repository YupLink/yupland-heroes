// Информационные тосты игры: HP цели, побег беглеца, размер награды и такие же
// сводки боя. Их игрок выключает в настройках («Уведомления в игре»,
// useGameNotify). Ошибки и ответы на его действия («не хватает энергии»,
// «куплено», «сохранено») идут обычным toast.* и не глушатся никогда — поэтому
// error здесь нет.
//
// Такой тост ничего не просит, поэтому тапы проходят сквозь него к карте,
// удару и кнопкам под ним. Крестик есть: кто включил уведомления, тот должен
// уметь убрать с глаз конкретное (владелец, 08.10.2026).
import { toast, type ExternalToast } from "sonner";
import { readGameNotify } from "@/lib/hooks/useGameNotify";
import { cn } from "@/lib/utils";

type Show = (message: string, data: ExternalToast) => string | number;

/**
 * Сквозной по тапам, но с крестиком: карта под тостом остаётся живой, а сам
 * тост закрывается. Крестику тапы нужны — его слой возвращает их себе.
 */
const passThrough = (data?: ExternalToast): ExternalToast => ({
  ...data,
  closeButton: true,
  className: cn(data?.className, "pointer-events-none [&_button]:pointer-events-auto"),
});

const gate =
  (show: Show) =>
  (message: string, data?: ExternalToast): string | number | undefined =>
    readGameNotify() ? show(message, passThrough(data)) : undefined;

export const gameInfoToast = Object.assign(
  gate((message, data) => toast(message, data)),
  {
    success: gate((message, data) => toast.success(message, data)),
    warning: gate((message, data) => toast.warning(message, data)),
  },
);
