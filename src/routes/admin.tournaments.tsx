// Админ · Турниры: категория, число дней, места одной колонкой и призы;
// запуск бронирует DARAI-фонд из пула карты, остановка подводит итоги сейчас.
// Тонкий маршрут — вся страница в components/admin/tournaments.
import { createFileRoute } from "@tanstack/react-router";
import { TourAdminPage } from "@/components/admin/tournaments/TourAdminPage";

export const Route = createFileRoute("/admin/tournaments")({
  head: () => ({ meta: [{ title: "Турниры" }, { name: "robots", content: "noindex" }] }),
  component: TourAdminPage,
});
