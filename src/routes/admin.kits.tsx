// Админ · Наборы: бокс из конструктора боксов × N, цена в $ (платят USDT, DARAI
// или Stars — как подписку), тираж, лимит на аккаунт, вкл/выкл.
// Тонкий маршрут — вся страница в components/admin/kits.
import { createFileRoute } from "@tanstack/react-router";
import { KitAdminPage } from "@/components/admin/kits/KitAdminPage";

export const Route = createFileRoute("/admin/kits")({
  head: () => ({ meta: [{ title: "Наборы" }, { name: "robots", content: "noindex" }] }),
  component: KitAdminPage,
});
