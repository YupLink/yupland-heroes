// Кнопки редактора объекта: правка ЭТОЙ клетки и отдельно — сохранение
// заготовки. Шаблон — только сохранённая заготовка: чтобы поменять одного
// конкретного босса на карте, трогать шаблон не нужно.
import { Save } from "lucide-react";

export function FullObjectEditorFooter({
  saving,
  onCancel,
  onSaveToCell,
  onSaveTemplate,
}: {
  saving: boolean;
  onCancel: () => void;
  /** Нет — редактор правит только шаблон (объект создают из палитры). */
  onSaveToCell?: () => void;
  onSaveTemplate: () => void;
}) {
  return (
    <div className="flex gap-2 border-t border-border p-4">
      <button
        onClick={onCancel}
        className="rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm font-medium"
      >
        Отмена
      </button>
      {onSaveToCell && (
        <button
          onClick={onSaveToCell}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl gradient-gold px-4 py-3 font-bold text-gold-foreground"
        >
          <Save className="h-4 w-4" /> Сохранить
        </button>
      )}
      <button
        onClick={onSaveTemplate}
        disabled={saving}
        title="Обновить саму заготовку — изменится у новых копий"
        className={
          onSaveToCell
            ? "rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm font-medium disabled:opacity-50"
            : "flex flex-1 items-center justify-center gap-2 rounded-xl gradient-gold px-4 py-3 font-bold text-gold-foreground disabled:opacity-50"
        }
      >
        {saving ? "Сохраняю…" : onSaveToCell ? "В шаблон" : "Сохранить"}
      </button>
    </div>
  );
}
