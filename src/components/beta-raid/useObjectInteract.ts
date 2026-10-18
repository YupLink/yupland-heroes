// Что делать с объектом, до которого добрались.
//
// Развилка одна на весь экран: босс (и всё, что «вскрывают») открывает окно
// боя с отрядом, а лут забирается одним нажатием прямо с карты. Вынесено из
// BetaRaidScreen, чтобы экран остался оркестратором и влезал в лимит файла
// (§13.6) — поведение то же самое, до байта.
import { useT } from "@/lib/i18n";
import { objectKind, objectAction } from "./objectKind";

/** Объект на клетке, по которой тапнули: этим он и открывается. */
export type TappedObject = { id: string; meta: unknown; kind: string | null; q: number; r: number };

type Target = { objectId: string; q: number; r: number };

export function useObjectInteract(opts: {
  /** Открыть окно боя (сюда уходят боссы и «вскрываемые» объекты). */
  openEncounter: (target: Target) => void;
  /** Забрать лут без окна — сундук на один тап, монетка, артефакт. */
  collect: (target: Target) => void;
}): (obj: TappedObject) => void {
  const t = useT();
  return (obj: TappedObject) => {
    const action = objectAction(objectKind(obj.id, obj.meta, obj.kind), obj.meta, t);
    if (action.opensBattle) {
      opts.openEncounter({ objectId: obj.id, q: obj.q, r: obj.r });
      return;
    }
    opts.collect({ objectId: obj.id, q: obj.q, r: obj.r });
  };
}
