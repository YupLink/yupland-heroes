// Админ · Дуэль героев — песочница пошагового боя (концепт Ярослава 29.10.2026).
// Только админам: маршрут под /admin (гейт в admin.tsx), ручки — requireAdmin.
import { createFileRoute } from "@tanstack/react-router";
import { DuelPage } from "@/components/admin/duel/DuelPage";

export const Route = createFileRoute("/admin/duel")({
  head: () => ({ meta: [{ title: "Дуэль героев" }, { name: "robots", content: "noindex" }] }),
  component: DuelPage,
});
