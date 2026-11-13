// Админ · Лаборатория артефактов (§8.81). Тонкий маршрут — страница в
// components/admin/lab.
import { createFileRoute } from "@tanstack/react-router";
import { LabPage } from "@/components/admin/lab/LabPage";

export const Route = createFileRoute("/admin/lab")({
  head: () => ({ meta: [{ title: "Лаборатория" }, { name: "robots", content: "noindex" }] }),
  component: LabPage,
});
