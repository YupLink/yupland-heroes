// Админские панели полноэкранной карты: в мире креатора — студия (одна панель
// сверху, режим бога сразу, «Ходьба», «Сохранить»), на остальных картах —
// прежние входы «Правка карты» и «Восстановление». Студия грузится по
// требованию, как и весь режим бога (adminLazy).
import { lazy, Suspense, type ReactNode } from "react";
import { AdminFullscreenPanels } from "./AdminFullscreenPanels";
import { AdminLiveLayer } from "./adminLazy";
import type { useAdminLive } from "./useAdminLive";

const Studio = lazy(() =>
  import("./creator/CreatorStudio").then((m) => ({ default: m.CreatorStudio })),
);

export function AdminPanels({
  live,
  restore,
}: {
  live: ReturnType<typeof useAdminLive>;
  restore?: ReactNode;
}) {
  if (live.creatorMap) {
    return (
      <Suspense fallback={null}>
        <Studio live={live} />
      </Suspense>
    );
  }
  return (
    <AdminFullscreenPanels
      edit={<AdminLiveLayer live={live} />}
      restore={restore}
      editActive={live.on}
    />
  );
}
