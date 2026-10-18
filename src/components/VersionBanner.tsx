// Жёлтый баннер сверху страницы: «Обновите, чтобы изменения вступили в силу».
// Показывается когда useVersion().outdated=true (клиентская BUILD_ID не
// совпадает с серверной). Кнопка «Обновить» делает window.location.reload().

import { RefreshCw } from "lucide-react";
import { useVersion } from "@/lib/versionCheck";

export function VersionBanner() {
  const { outdated, reload } = useVersion();
  if (!outdated) return null;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-amber-400/40 bg-amber-400/15 px-3 py-2 text-xs backdrop-blur">
      <div className="flex min-w-0 items-center gap-2 text-amber-200">
        <RefreshCw className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate font-medium">
          Обновите страницу, чтобы изменения вступили в силу
        </span>
      </div>
      <button
        type="button"
        onClick={reload}
        className="shrink-0 rounded-md bg-amber-400 px-3 py-1 text-[11px] font-bold text-amber-950 transition hover:bg-amber-300"
      >
        Обновить
      </button>
    </div>
  );
}
