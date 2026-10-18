import { createFileRoute, redirect } from "@tanstack/react-router";

// «Раздача DARAI» переехала ВНУТРЬ «Магазина билетов» (доход — оттуда), поэтому
// /admin/payouts больше не отдельный экран — редиректим на /admin/shop.
// Доступ к самой раздаче остаётся под owner-гейтом: секция в shop рендерится
// только при session.isPayoutsAdmin, а server-fn adminDistributeDarai — под
// requirePayoutsAdmin.
export const Route = createFileRoute("/admin/payouts")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/shop" });
  },
});
