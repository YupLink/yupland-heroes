// Админ · Генератор миров: карты-черновики и бесконечные миры по логике живой
// карты. Тонкий маршрут — вся страница в components/admin/worldgen.
import { createFileRoute } from "@tanstack/react-router";
import { WorldgenPage } from "@/components/admin/worldgen/WorldgenPage";

export const Route = createFileRoute("/admin/worldgen")({
  head: () => ({ meta: [{ title: "Генератор миров" }, { name: "robots", content: "noindex" }] }),
  component: WorldgenPage,
});
