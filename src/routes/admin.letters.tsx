// Админ · Письма игрокам: окно на весь экран при входе в игру — кому
// (только мне / всем / списку), текст, картинка, включить/выключить.
// Тонкий маршрут — вся страница в components/admin/letters.
import { createFileRoute } from "@tanstack/react-router";
import { LetterAdminPage } from "@/components/admin/letters/LetterAdminPage";

export const Route = createFileRoute("/admin/letters")({
  head: () => ({ meta: [{ title: "Письма игрокам" }, { name: "robots", content: "noindex" }] }),
  component: LetterAdminPage,
});
