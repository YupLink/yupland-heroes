// YUPLINK · Фишки — barrel file
// Re-exports all components from the chips module.
// Route definition lives here (TanStack Router expects it in src/routes/chips.tsx).

import { createFileRoute } from "@tanstack/react-router";
import { ChipsEntry } from "@/components/chips/ChipsEntry";
import portraitScene from "@/assets/loading/yupik-scene.webp";
import wideScene from "@/assets/loading/yupik-scene-wide.webp";

export const Route = createFileRoute("/chips")({
  head: () => ({
    links: [
      { rel: "preload", as: "image", href: portraitScene, media: "(max-aspect-ratio: 749/1000)" },
      { rel: "preload", as: "image", href: wideScene, media: "(min-aspect-ratio: 3/4)" },
    ],
    meta: [
      { title: "Фишки — YupLink" },
      {
        name: "description",
        content: "Собирай фишки YUPLINK, открывай паки и сражайся за призы в PVP",
      },
    ],
  }),
  component: ChipsEntry,
});

// Re-export all components that are imported from "@/routes/chips"
export { ChipsTab } from "@/components/chips/ChipsTab";
export { EnergyBuyModal } from "@/components/chips/EnergyBuyModal";
