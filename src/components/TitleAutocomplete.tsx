import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getScanState,
  listCollectionTitles,
  scanCollection,
} from "@/server/api/admin-campaigns-scan-run";
import {
  Search,
  RefreshCw,
  Loader2,
  Check,
  X,
  Square,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NftImage } from "@/components/NftImage";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface SelectedTitle {
  title: string;
  image: string | null;
  count: number;
}

export function TitleAutocomplete({
  value,
  onSelect,
}: {
  value: SelectedTitle | null;
  onSelect: (t: SelectedTitle | null) => void;
}) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Закрываем dropdown при клике вне
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Авто-цикл: после первого вызова сам себя дёргает пока endOfCollection=false
  const autoRef = useRef(false);
  const [autoActive, setAutoActive] = useState(false);

  const titles = useQuery({
    queryKey: ["admin", "collection-titles", query],
    queryFn: () => listCollectionTitles({ data: { q: query } }),
    enabled: open,
    staleTime: 60_000,
  });

  const state = useQuery({
    queryKey: ["admin", "scan-state"],
    queryFn: () => getScanState(),
    // Во время авто-цикла чаще обновляем счётчик «N просмотрено» для UX
    refetchInterval: autoActive ? 2_000 : 60_000,
  });

  const scan = useMutation({
    mutationFn: () => scanCollection({ data: { pages: 10 } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["admin", "scan-state"] });
      qc.invalidateQueries({ queryKey: ["admin", "collection-titles"] });
      if (res.endOfCollection) {
        autoRef.current = false;
        setAutoActive(false);
        toast.success(
          `Скан завершён. Просмотрено всего: ${res.totalSeen} NFT.`
        );
      } else if (autoRef.current) {
        // Продолжаем со следующего offset — сразу следующий вызов
        scan.mutate();
      } else {
        toast.success(
          `+${res.itemsThisRun} NFT за проход. Всего: ${res.totalSeen}.`
        );
      }
    },
    onError: (e: Error) => {
      autoRef.current = false;
      setAutoActive(false);
      toast.error(`Ошибка скана: ${e.message}`);
    },
  });

  const startAutoScan = () => {
    autoRef.current = true;
    setAutoActive(true);
    scan.mutate();
  };

  const stopAutoScan = () => {
    autoRef.current = false;
    setAutoActive(false);
  };

  const items = titles.data ?? [];

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={value ? value.title : query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              if (value) onSelect(null);
              setQuery(e.target.value);
              setOpen(true);
            }}
            placeholder="Начни печатать или открой список…"
            className="w-full rounded-xl border border-border bg-secondary/40 px-10 py-2.5 text-sm outline-none focus:border-gold/50"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {value ? (
              <button
                onClick={() => {
                  onSelect(null);
                  setQuery("");
                  setOpen(true);
                }}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : titles.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : null}
          </div>
        </div>

        {open && (
          <div className="absolute z-20 mt-1 max-h-96 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-card">
            {items.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                {titles.isLoading
                  ? "Загружаем…"
                  : query
                    ? `Нет совпадений для «${query}». Сделай скан, если коллекция ещё не загружена.`
                    : "Кэш пуст. Запусти скан кнопкой ниже."}
              </div>
            ) : (
              items.map((it) => (
                <button
                  key={it.title}
                  type="button"
                  onClick={() => {
                    onSelect({
                      title: it.title,
                      image: it.image,
                      count: it.count,
                    });
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 border-b border-border/50 px-3 py-2 text-left transition hover:bg-secondary/40 last:border-b-0",
                    value?.title === it.title && "bg-gold/10"
                  )}
                >
                  <div className="aspect-square h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border bg-background">
                    {it.image ? (
                      <NftImage
                        src={it.image}
                        alt={it.title}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {it.title}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      × {it.count} NFT
                    </div>
                  </div>
                  {value?.title === it.title && (
                    <Check className="h-4 w-4 text-gold" />
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Только кнопка скана + подсказка. Никаких статус-строк. */}
      <div className="flex items-center justify-end gap-2">
        {autoActive ? (
          <span className="text-[11px] text-muted-foreground">
            просмотрено{" "}
            <span className="text-foreground">
              {state.data?.totalSeen ?? 0}
            </span>{" "}
            NFT
          </span>
        ) : null}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Подсказка"
              className="text-muted-foreground/60 transition hover:text-foreground focus:text-foreground focus:outline-none"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="end"
            className="w-64 text-[12px] leading-relaxed"
          >
            Список NFT хранится в общей базе для всех админов. Сканируй
            только если нужного NFT нет в выпадающем списке — это добавит
            новые.
          </PopoverContent>
        </Popover>
        {autoActive ? (
          <button
            onClick={stopAutoScan}
            className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1 text-[11px] font-medium text-destructive transition hover:bg-destructive/10"
          >
            <Square className="h-3 w-3" fill="currentColor" />
            Остановить
          </button>
        ) : (
          <button
            onClick={startAutoScan}
            disabled={scan.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-gold/30 bg-gold/5 px-2.5 py-1 text-[11px] font-medium text-gold transition hover:bg-gold/10 disabled:opacity-50"
          >
            {scan.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {scan.isPending ? "Сканируем…" : "Сканировать"}
          </button>
        )}
      </div>
    </div>
  );
}
