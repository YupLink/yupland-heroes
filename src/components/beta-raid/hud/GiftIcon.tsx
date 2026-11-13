// Картинка подарка в списке: своя, иначе значок вида. У артефакта — полоса
// прочности внизу (износ, 22.10.2026): с аукциона он приходит таким, каким его
// выставил продавец. Вынесено из GiftsModal ради лимита в 250 строк.
import { Gift } from "lucide-react";
import { rewardKindImage } from "@/lib/rewardKinds";
import type { MyGift } from "@/server/api/gifts";
import { ArtWearBar } from "@/components/ArtWearBar";

export function GiftIcon({ g }: { g: MyGift }) {
  const src = g.image ?? rewardKindImage(g.kind, g.refId);
  return (
    <>
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <Gift className="h-5 w-5 text-pink-300" />
      )}
      {g.kind === "art" && <ArtWearBar durability={g.durability} />}
    </>
  );
}
