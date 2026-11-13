// Ячейка артефакта: картинка и имя, у зачарованного — ✦. В попапе выбора
// зачарованный серый и не нажимается (одно зачарование на артефакт).
import { ImageOff } from "lucide-react";
import { thumb } from "@/lib/image";
import { EnchantMark } from "@/components/EnchantMark";
import type { EnchantArtifactView } from "@/lib/enchant/enchant";

export function EnchantArtCell({
  a,
  pressed,
  locked = false,
  onClick,
}: {
  a: EnchantArtifactView;
  pressed: boolean;
  /** Нельзя выбрать — зачарован. */
  locked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`ench-cell${a.enchant ? " is-locked" : ""}`}
      aria-pressed={pressed}
      disabled={locked}
      onClick={onClick}
    >
      <EnchantMark pct={a.enchant?.pct} className="ench-seal" />
      {a.image ? (
        <img
          className="ench-art"
          src={thumb(a.image, 160)}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="ench-art is-none">
          <ImageOff className="h-5 w-5" />
        </span>
      )}
      <span className="ench-nm">{a.name}</span>
    </button>
  );
}
