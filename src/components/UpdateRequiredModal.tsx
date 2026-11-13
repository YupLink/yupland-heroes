// Сторож критичных действий (покупка билетов за токены, крафт, минт) на старой
// версии сайта: действие не идёт, страница тихо обновляется сама (без окна).
//
// Использование:
//   const { check, ModalNode } = useUpdateGuard();
//   ...
//   onClick={() => { if (check()) return; doRealAction(); }}
//   {ModalNode}

import type { ReactNode } from "react";
import { useVersion } from "@/lib/versionCheck";

export function useUpdateGuard(): {
  check: () => boolean;
  ModalNode: ReactNode;
} {
  const { outdated, reload } = useVersion();
  // Без окна «Обновите страницу» (владелец, 28.10.2026: игрока не гонять): старая версия
  // не делает важное действие — страница сама обновляется, игрок повторит на новой.
  function check(): boolean {
    if (outdated) {
      reload();
      return true; // блокируем — caller должен return
    }
    return false; // версия OK — caller продолжает
  }
  return { check, ModalNode: null };
}
