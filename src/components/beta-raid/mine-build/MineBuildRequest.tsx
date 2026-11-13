// «Поставить» на заготовке шахты: окна нет — рюкзак закрывается, и карта входит
// в режим стройки (mineBuildStore). Рюкзак открыт не с карты — режим включится,
// как только игрок откроет карту.
import { useEffect } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import type { PlaceableBlueprint } from "@/lib/minePlacement";
import { requestMineBuild } from "./mineBuildStore";

export function MineBuildRequest({
  stackKey,
  kind,
  onClose,
}: {
  stackKey: string;
  kind: PlaceableBlueprint;
  onClose: () => void;
}) {
  const t = useT();
  useEffect(() => {
    if (!requestMineBuild(stackKey, kind)) toast(t("mineplace.on_map"));
    onClose();
    // Одна просьба на одно нажатие «Поставить».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
