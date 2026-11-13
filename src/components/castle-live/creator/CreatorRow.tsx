// Строка «Мир креатора» в профиле (владелец, 07.11.2026: «сначала создать мир —
// и уже в нём загрузить шаблоны, создать новый мир, назвать»). Одна строка:
// вне мира — войти (свой мир, где был последним; своих нет — новый «Мир 1»),
// в мире — выйти туда, откуда пришёл. Всё остальное — панель мира на карте
// (beta-raid/creator/CreatorWorldBar). Строка — только у права creator и у
// админа, «выйти» — у любого, кто стоит в мире (сервер решает).
import { Loader2, LogOut, PencilRuler } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useCreatorAccess, useCreatorMove } from "@/components/beta-raid/creator/useCreator";

export function CreatorRow() {
  const t = useT();
  const access = useCreatorAccess();
  const move = useCreatorMove();
  if (!access.data?.allowed) return null;
  const onWork = access.data.onWork;
  const Icon = move.isPending ? Loader2 : onWork ? LogOut : PencilRuler;
  return (
    <button
      type="button"
      data-game-button="row"
      className="castle-profile__row"
      disabled={move.isPending}
      onClick={() => move.mutate(onWork ? { kind: "leave" } : { kind: "enter" })}
    >
      <Icon className={move.isPending ? "animate-spin" : undefined} aria-hidden="true" />
      <span>{t(onWork ? "creator.leave" : "creator.row")}</span>
    </button>
  );
}
