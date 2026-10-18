// Модалка, которая показывается перед критичными действиями (покупка
// билетов за токены, крафт, минт) когда юзер на старой версии сайта.
// Блокирует действие, пока не нажмёт «Обновить».
//
// Использование:
//   const { check, ModalNode } = useUpdateGuard();
//   ...
//   onClick={() => { if (check()) return; doRealAction(); }}
//   {ModalNode}

import { useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { useVersion } from "@/lib/versionCheck";

export function useUpdateGuard(): {
  check: () => boolean;
  ModalNode: ReactNode;
} {
  const { outdated, reload } = useVersion();
  const [open, setOpen] = useState(false);

  function check(): boolean {
    if (outdated) {
      setOpen(true);
      return true; // блокируем — caller должен return
    }
    return false; // версия OK — caller продолжает
  }

  const ModalNode = open ? (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 backdrop-blur-md sm:items-center">
      <div className="m-3 w-full max-w-sm rounded-2xl border border-amber-400/40 bg-card p-5 text-center shadow-2xl">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10">
          <RefreshCw className="h-6 w-6 text-amber-400" />
        </div>
        <div className="mb-1 font-display text-base font-bold">
          Обновите страницу
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Сайт обновился. Чтобы изменения вступили в силу — нажмите
          «Обновить». Старая версия не сможет выполнить это действие
          корректно.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex-1 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-xs font-medium"
          >
            Позже
          </button>
          <button
            type="button"
            onClick={reload}
            className="flex-1 rounded-xl bg-amber-400 px-3 py-2.5 text-xs font-bold text-amber-950 transition hover:bg-amber-300"
          >
            Обновить
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { check, ModalNode };
}
