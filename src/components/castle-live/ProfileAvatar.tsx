import type { ReactNode } from "react";
import { UserRound } from "lucide-react";
export function ProfileAvatar({
  imageUrl,
  onClick,
  label,
  loading = false,
  badge,
}: {
  imageUrl?: string | null;
  onClick: () => void;
  label: string;
  loading?: boolean;
  /** Метка поверх кружка (точка «есть что забрать»). */
  badge?: ReactNode;
}) {
  return (
    <button
      data-game-button="surface"
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-busy={loading}
      className="relative ml-auto grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-gold/60 bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <UserRound aria-hidden className={loading ? "h-5 w-5 animate-pulse" : "h-5 w-5"} />
      )}
      {badge}
    </button>
  );
}
