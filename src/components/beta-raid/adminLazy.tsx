// Инструменты админа на карте — по требованию (13.10.2026). Режим бога с окном
// клетки и редактором объектов, раздача, восстановление, экономика: ~60 КБ кода,
// который качали все игроки, хотя показывается он только админам.
import { memo, Suspense, lazy, type ComponentProps } from "react";

const LiveLayer = lazy(() =>
  import("./AdminLiveLayer").then((m) => ({ default: m.AdminLiveLayer })),
);
const RaidRestore = lazy(() =>
  import("./AdminRaidRestore").then((m) => ({ default: m.AdminRaidRestore })),
);
const Economy = lazy(() =>
  import("./economy/EconomyPanel").then((m) => ({ default: m.EconomyPanel })),
);

export function AdminLiveLayer(props: ComponentProps<typeof LiveLayer>) {
  return (
    <Suspense fallback={null}>
      <LiveLayer {...props} />
    </Suspense>
  );
}

function AdminRaidRestoreView() {
  return (
    <Suspense fallback={null}>
      <RaidRestore />
    </Suspense>
  );
}

export function EconomyPanel() {
  return (
    <Suspense fallback={null}>
      <Economy />
    </Suspense>
  );
}

// memo: экран рейда перерисовывается на каждый шаг героя, а этому компоненту
// шаг ни при чём — без memo он с иконками шёл следом (замер 06.11.2026).
export const AdminRaidRestore = memo(AdminRaidRestoreView);
