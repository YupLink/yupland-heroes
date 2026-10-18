// Главная YupLink (старый лендинг, 1-в-1) — на /home.
// '/' = кошелёк («кош наоборот», одобрено владельцем 03.07).
import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/LandingPage";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "YupLink" },
      {
        name: "description",
        content:
          "Подключи NEAR-кошелёк, выбери свой NFT и получи награду в одном из токенов экосистемы Golden Darai.",
      },
    ],
  }),
  component: LandingPage,
});
