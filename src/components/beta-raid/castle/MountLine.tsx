// Строка коня в карточке артефакта (§8.84): темп бега по карте, у пегаса — прыжок.
import { useLang, useT } from "@/lib/i18n";
import { JUMP_ENERGY, mountJumps, mountSpeedLabel, mountTier } from "@/lib/hero/mount";

export function MountLine({ mount, pct = 0 }: { mount: string | null | undefined; pct?: number }) {
  const t = useT();
  const lang = useLang() === "en" ? "en" : "ru";
  if (!mount) return null;
  const tier = mountTier(mount);
  return (
    <div className="text-success">
      {t("mount.speed", { x: mountSpeedLabel(tier, lang, pct) })}
      {mountJumps(tier) && ` · ${t("mount.jump", { n: JUMP_ENERGY })}`}
    </div>
  );
}
