// Слот «Раскопки» — прототип отдельной вкладкой (демо-кредиты, без денег).
import { createFileRoute } from "@tanstack/react-router";
import { SlotScreen } from "@/components/slot/SlotScreen";

export const Route = createFileRoute("/slot")({
  head: () => ({
    meta: [
      { title: "Раскопки — YupLink" },
      {
        name: "description",
        content: "Слот «Раскопки»: механика Fairy Land, 9 линий, бонус-игра, супер-бонус, риск.",
      },
    ],
  }),
  component: SlotPage,
});

function SlotPage() {
  return <SlotScreen />;
}
