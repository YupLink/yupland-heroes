// Находка под кучкой: картинка из игры (мешочек / сундук / магический сундук) и
// сумма в плашке поверх, у нижнего края ячейки. Ловушка — капкан.
import { cn } from "@/lib/utils";
import { findKind } from "@/lib/slot/bonus";
import { TrapIcon } from "./SlotArt";

const FIND_IMG = {
  bag: "/slot/pouch.webp",
  chest: "/slot/chest.webp",
  magic: "/slot/chest-magic.webp",
} as const;

export function FindArt({ mult, className }: { mult: number; className?: string }) {
  if (mult === 0) return <TrapIcon className={className} />;
  const kind = findKind(mult);
  return (
    <img
      src={FIND_IMG[kind]}
      alt=""
      className={cn(
        "object-contain",
        className,
        kind === "magic" && "drop-shadow-[0_0_10px_rgba(167,139,250,0.9)]",
      )}
    />
  );
}

export function SlotFind({
  mult,
  stake,
  className,
}: {
  mult: number;
  stake: number;
  className?: string;
}) {
  return (
    <div className={cn("animate-slot-pop flex flex-col items-center", className)}>
      <FindArt
        mult={mult}
        className="relative z-0 mt-[2%] h-[68%] w-[68%] drop-shadow-[0_4px_6px_rgba(0,0,0,0.8)]"
      />
      {mult > 0 && (
        <span className="absolute bottom-[4%] left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/90 px-2 py-0.5 font-display text-xs font-bold tabular-nums leading-none text-[#f3ca62] ring-1 ring-[#f3ca62]/70">
          {mult * stake}
        </span>
      )}
    </div>
  );
}
