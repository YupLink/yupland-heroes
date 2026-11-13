// «Рамки Telegram» в профиле (владелец, 30.10.2026): шапка Telegram с крестиком над
// игрой или игра во весь экран. Строка есть только в мобильном Telegram, где
// полный экран бывает (lib/telegram/mobileFullscreen.ts); в браузере и на ПК её нет.
import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { canToggleTgFrame, setTgFrame, tgFrameOn } from "@/lib/telegram/mobileFullscreen";

export function TgFrameToggle({ ru }: { ru: boolean }) {
  // До монтирования не знаем, Telegram ли это: на сервере строки нет, без мигания разметки.
  const [frame, setFrame] = useState<boolean | null>(null);
  useEffect(() => {
    if (canToggleTgFrame()) setFrame(tgFrameOn());
  }, []);
  if (frame === null) return null;
  return (
    <button
      type="button"
      data-game-button="row"
      className="castle-profile__row"
      role="switch"
      aria-checked={frame}
      onClick={() => {
        setTgFrame(!frame);
        setFrame(!frame);
      }}
    >
      <Smartphone aria-hidden="true" /><span>{ru ? "Рамки Telegram" : "Telegram frame"}</span><span className={`castle-profile__switch ${frame ? "is-on" : ""}`} aria-hidden="true" />
    </button>
  );
}
