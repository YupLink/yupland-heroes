// Инструменты админа на карте — по требованию (13.10.2026). Режим бога с окном
// клетки и редактором объектов, раздача, восстановление, экономика: ~60 КБ кода,
// который качали все игроки, хотя показывается он только админам.
import { Suspense, lazy, type ComponentProps } from "react";

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

export function AdminRaidRestore() {
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
