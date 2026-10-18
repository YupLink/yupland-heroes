// «Как получить лайки» — окно по кнопке «i» в шапке замка (дизайн Ангелины).
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const SOURCES = [
  {
    ru: ["Боссы", "За бой с боссом можно получить лайки. Последний удар наносить необязательно: за твой вклад может достаться часть награды, даже если босса победит другой игрок."],
    en: ["Bosses", "Fighting bosses can earn you likes. You do not need the final blow: your contribution may earn a share of the reward even if another player defeats the boss."],
  },
  {
    ru: ["Сундуки", "Лайки также можно найти в сундуках."],
    en: ["Chests", "You can also find likes in chests."],
  },
  {
    ru: ["Промокоды", "Лайки можно получить по промокоду. Введи его в разделе «Промокод» в настройках Профиля."],
    en: ["Promo codes", "You can receive likes with a promo code. Enter it under Promo code in Profile settings."],
  },
] as const;

export function CastleLikesInfo({
  ru,
  open,
  onOpenChange,
}: {
  ru: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="castle-likes-info" closeLabel={ru ? "Закрыть" : "Close"}>
        <div className="castle-likes-info__heading">
          <img src="/resources/likes.webp" alt="" aria-hidden="true" />
          <DialogTitle>{ru ? "Как получить лайки" : "How to get likes"}</DialogTitle>
        </div>
        <DialogDescription className="castle-likes-info__body">
          {SOURCES.map((s) => {
            const [title, text] = ru ? s.ru : s.en;
            return (
              <span className="castle-likes-info__source" key={title}>
                <strong>{title}</strong>
                <span>{text}</span>
              </span>
            );
          })}
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
}
