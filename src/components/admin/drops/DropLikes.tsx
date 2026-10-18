export type LikeLaunchItem = {
  candidateId: string;
  title: string;
  contractId: string;
};

export function LikeLaunchBanner({
  items,
  onDismiss,
}: {
  items: LikeLaunchItem[];
  onDismiss: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3 flex items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs">
      <span className="text-rose-300">❤️</span>
      <span className="min-w-0 flex-1">
        <b>Запуск из голосования</b>:{" "}
        {items.length === 1
          ? `«${items[0].title}»`
          : `${items.length} позиц.`}{" "}
        — после создания лайки автоматически зачтутся у всех.
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-[10px] text-muted-foreground underline hover:text-foreground"
      >
        отменить
      </button>
    </div>
  );
}
