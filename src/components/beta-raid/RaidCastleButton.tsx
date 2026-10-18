import { Link } from "@tanstack/react-router";
import { Castle } from "lucide-react";
import { useAppStore } from "@/lib/store";

/**
 * Только переход: героя не двигает и состояние рейда не меняет.
 * Подпись «Внутрянка», а не «Замок»: в HUD рейда уже есть кружок замка —
 * он везёт камеру к замку НА КАРТЕ, а эта кнопка открывает интерьер.
 */
export function RaidCastleButton({ onClick }: { onClick?: () => void } = {}) {
  const ru = useAppStore((s) => s.lang) === "ru";
  // Рейд открыт из замка (вход админа) — возврат в замок, а не в редактор.
  if (onClick)
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ru ? "Вернуться в замок" : "Return to castle"}
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-gold/40 bg-background px-3 text-sm text-gold"
      >
        <Castle className="h-5 w-5" aria-hidden="true" />
        {ru ? "Замок" : "Castle"}
      </button>
    );
  return (
    <Link
      to="/castle-editor"
      search={{ view: "play" }}
      aria-label={ru ? "Открыть внутрянку замка" : "Open the castle interior"}
      className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-gold/40 bg-background px-3 text-sm text-gold"
    >
      <Castle className="h-5 w-5" aria-hidden="true" />
      {ru ? "Внутрянка" : "Interior"}
    </Link>
  );
}
