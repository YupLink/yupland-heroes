// Consistent loading/error UI; initial offline queries stay pending, not "no map".
import { useLang } from "@/lib/i18n";
import { GameLoadState } from "@/components/game/GameLoadState";

type Props = { fullscreen?: boolean; onBack?: () => void };
export function BetaRaidLoading({ fullscreen = false, onBack }: Props = {}) {
  const ru = useLang() === "ru";
  return <GameLoadState ru={ru} state="loading" destination="world" fullscreen={fullscreen} onBack={onBack} backLabel={fullscreen ? undefined : ru ? "← Назад" : "← Back"} />;
}
export function BetaRaidLoadError({ fullscreen = false, onRetry, onBack }: Props & { onRetry: () => void }) {
  const ru = useLang() === "ru";
  return <GameLoadState ru={ru} state="error" destination="world" fullscreen={fullscreen} onRetry={onRetry} onBack={onBack} backLabel={fullscreen ? undefined : ru ? "← Назад" : "← Back"} />;
}
export function BetaRaidNoMap({ onClose, fullscreen = false }: { onClose?: () => void; fullscreen?: boolean }) {
  const ru = useLang() === "ru";
  return <GameLoadState ru={ru} state="empty" destination="world" fullscreen={fullscreen} onBack={onClose} backLabel={fullscreen ? undefined : ru ? "← Назад" : "← Back"} />;
}

