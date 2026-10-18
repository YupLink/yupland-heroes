// Открытый архив картинок игры (владелец, 06.10.2026): длинный адрес, чтобы
// не находили случайно; поисковикам закрыт. Вход не нужен — скачать может кто
// угодно. Сама страница — components/media-archive.
import { createFileRoute } from "@tanstack/react-router";
import { MediaArchivePage } from "@/components/media-archive/MediaArchivePage";

export const Route = createFileRoute("/archive/yuplink-game-art-all-images")({
  head: () => ({
    meta: [{ title: "YupLink — архив картинок" }, { name: "robots", content: "noindex" }],
  }),
  component: MediaArchivePage,
});
