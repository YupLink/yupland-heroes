// Showcase: 5 карточек 1-в-1 как FlatChipCard в инвентаре.
// Разметка скопирована буквально, меняется ТОЛЬКО arcVariant и метка
// варианта добавлена как обычный бейдж внутри карточки (как #templateNo).

import { cn } from "@/lib/utils";
import {
  ChipImage,
  chipPanelClasses,
  type ArcVariant,
} from "@/components/ChipImage";

interface ChipPreview {
  imageUrl: string;
  templateName: string;
  templateNo: number;
  serialNo: number | null;
  level: number;
}

function VariantCard({
  chip,
  variant,
  label,
}: {
  chip: ChipPreview;
  variant: ArcVariant;
  label: string;
}) {
  // СТРУКТУРА 1-в-1 с FlatChipCard. Меняется только arcVariant +
  // метка варианта прибита поверх как нижний бейдж по центру.
  return (
    <button
      type="button"
      className={cn(
        "relative overflow-hidden rounded-2xl text-left backdrop-blur transition hover:brightness-110",
        chipPanelClasses(chip.level)
      )}
    >
      <div className="relative p-2">
        <ChipImage
          src={chip.imageUrl}
          level={chip.level}
          alt={chip.templateName}
          className="w-full"
          arcVariant={variant}
        />
        <span className="absolute left-2.5 top-2.5 inline-flex items-center justify-center rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] font-bold backdrop-blur">
          #{chip.templateNo}
        </span>
        <span className="absolute right-2.5 top-2.5 inline-flex items-center justify-center rounded-full bg-background/80 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground backdrop-blur">
          #{chip.serialNo ?? "?"}
        </span>
      </div>
      <div className="space-y-0.5 px-2 pb-2">
        <div className="truncate text-[11px] font-medium">
          {chip.templateName}
        </div>
        <div className="text-[10px] text-gold">{chip.level}lvl+</div>
      </div>
      {/* Метка варианта — нижний бейдж по центру (поверх) */}
      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-card">
        {label}
      </span>
    </button>
  );
}

/** 5 вариантов подложки. Сетка ровно как у MyInventoryTab — карточки 1:1. */
export function ChipDesignShowcase({ chip }: { chip: ChipPreview }) {
  const previewChip: ChipPreview = { ...chip, level: 2.5 };
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      <VariantCard chip={previewChip} variant="thin" label="A" />
      <VariantCard chip={previewChip} variant="thick" label="B" />
      <VariantCard chip={previewChip} variant="deep" label="C" />
      <VariantCard chip={previewChip} variant="clip" label="D" />
      <VariantCard chip={previewChip} variant="gradient" label="E" />
    </div>
  );
}

// Anatomy убрана — была мелкая, сжимала всё. Когда нужно — добавим
// отдельным режимом без сжатия размеров.
export function ChipAnatomy(_: { chip: ChipPreview }) {
  void _;
  return null;
}
