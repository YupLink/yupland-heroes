// Открытый справочник параметров игры (владелец, 12.10.2026): рядом с архивом
// картинок, тот же длинный адрес и noindex, вход не нужен. Сама страница —
// components/params-guide.
import { createFileRoute } from "@tanstack/react-router";
import { ParamsGuidePage } from "@/components/params-guide/ParamsGuidePage";

export const Route = createFileRoute("/archive/yuplink-game-params-guide")({
  head: () => ({
    meta: [{ title: "YupLink — справочник параметров" }, { name: "robots", content: "noindex" }],
  }),
  component: ParamsGuidePage,
});
