// Внутрянка замка — отдельная страница вне /admin/*, СВОЯ область дизайнера
// (админы и designer.example.tg). Слои, свои картинки, блоки 2–10 клеток с масштабом,
// подписи построек; «Тест · игровые окна» — настоящие окна игры по постройкам.
import { CastleLiveView } from "@/components/castle-live/CastleLiveView";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { castleEditorLoad, castleEditorSave } from "@/server/api/castle-editor";
import { castleEditorDeleteAsset } from "@/server/api/castle-editor-assets";
import { AssetModal } from "@/components/castle-editor/AssetModal";
import { CastleCanvas } from "@/components/castle-editor/CastleCanvas";
import { CastleHeader, CastleLoadError } from "@/components/castle-editor/CastleHeader";
import { CastlePalette } from "@/components/castle-editor/CastlePalette";
import { useCastleCells } from "@/components/castle-editor/useCastleCells";
import {
  LAYER_FIELD,
  cellHasContent,
  type Asset,
  type Brush,
  type CastleKind,
  type CellMap,
} from "@/components/castle-editor/types";

export const Route = createFileRoute("/castle-editor")({
  validateSearch: (search: Record<string, unknown>): { view?: "play" } =>
    search.view === "play" ? { view: "play" } : {},
  component: CastleEditorPage,
});

type LoadResult = { cells: CellMap; assets: Asset[] };
const KEY = ["castle-editor"] as const;

function CastleEditorPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { view } = Route.useSearch();
  const [testing, setTesting] = useState(view === "play");
  /** Выход из теста стирает ?view=play: иначе перезагрузка снова кидала в игру. */
  const stopTesting = () => {
    setTesting(false);
    if (view === "play") void navigate({ to: "/castle-editor", search: {}, replace: true });
  };

  const q = useQuery({
    queryKey: KEY,
    queryFn: () => castleEditorLoad(),
    staleTime: 0,
    gcTime: 0,
    refetchOnReconnect: false,
  });
  const grid = useCastleCells({});
  const { cells, setCells, selected, activeGroup } = grid;
  // Клетки — ОДИН раз из свежего ответа (isFetchedAfterMount): повторная заливка
  // q.data.cells стёрла бы несохранённую покраску.
  const hydrated = useRef(false);
  /** Последний сохранённый снимок; null — карта ещё не загружена. */
  const [savedCells, setSavedCells] = useState<CellMap | null>(null);
  useEffect(() => {
    // isFetchedAfterMount взводится и после ошибки — потому ещё и status.
    if (!q.data || q.status !== "success" || !q.isFetchedAfterMount || hydrated.current) return;
    hydrated.current = true;
    setSavedCells(q.data.cells);
    setCells(q.data.cells);
  }, [q.data, q.status, q.isFetchedAfterMount, setCells]);
  const loaded = savedCells !== null;
  const dirty = loaded && cells !== savedCells;
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const [kind, setKind] = useState<CastleKind>("terrain");
  const [brush, setBrush] = useState<Brush | null>(null);
  const [mergeMode, setMergeMode] = useState(false);
  /** undefined — модалка закрыта; {asset:null} — новый; {asset} — правка. */
  const [editing, setEditing] = useState<{ kind: CastleKind; asset: Asset | null } | undefined>();

  // Каталог — тоже только из свежего ответа (старый persist мог быть иной формы).
  const assets: Asset[] = useMemo(
    () => (loaded ? (q.data?.assets ?? []) : []),
    [loaded, q.data?.assets],
  );
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  const patchCache = (patch: (prev: LoadResult) => LoadResult) =>
    qc.setQueryData<LoadResult>(KEY, (prev) => (prev ? patch(prev) : prev));

  // Снимок клеток — переменная мутации: мазки во время запроса остаются
  // «несохранёнными», а не помечаются сохранёнными из замыкания.
  const save = useMutation({
    mutationFn: (snapshot: CellMap) => {
      if (!hydrated.current) return Promise.reject(new Error("Карта ещё не загружена"));
      return castleEditorSave({ data: { cells: snapshot } });
    },
    onSuccess: (_r, snapshot) => {
      toast.success("Сохранено");
      setSavedCells(snapshot);
      patchCache((p) => ({ ...p, cells: snapshot }));
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const del = useMutation({
    mutationFn: (a: Asset) => castleEditorDeleteAsset({ data: { id: a.id } }),
    onSuccess: (_r, a) => {
      toast.success("Удалено");
      // Снимаем ассет из клеток локально (сервер это делает через ON DELETE SET NULL).
      const field = LAYER_FIELD[a.kind as CastleKind];
      const strip = (map: CellMap): CellMap => {
        const next: CellMap = {};
        for (const [k, v] of Object.entries(map)) {
          const c = v[field] === a.id ? { ...v, [field]: null } : v;
          if (cellHasContent(c)) next[k] = c;
        }
        return next;
      };
      setCells((prev) => strip(prev));
      if (brush?.assetId === a.id) setBrush(null);
      patchCache((p) => ({ assets: p.assets.filter((x) => x.id !== a.id), cells: strip(p.cells) }));
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const onCellClick = (key: string) => {
    if (mergeMode) {
      // Клик по готовому блоку — выбрать его (масштаб/разъединение);
      // по одиночной — тумблер выделения.
      const gid = cells[key]?.groupId ?? null;
      if (gid) grid.setActiveGroup(gid === activeGroup ? null : gid);
      else grid.toggleSelect(key);
      return;
    }
    if (brush) grid.paint(key, brush);
  };
  const groupInfo = useMemo(() => {
    if (!activeGroup) return null;
    const members = Object.values(cells).filter((c) => c.groupId === activeGroup);
    return members.length ? { cells: members.length, scale: members[0].iconScale } : null;
  }, [cells, activeGroup]);

  // Глухой экран — только пока карта не загружена: ошибка повторного запроса
  // не должна прятать редактор с несохранённой покраской.
  if (q.error && !loaded)
    return <CastleLoadError error={q.error} onRetry={() => void q.refetch()} />;

  // Заход сразу в игру (?view=play из рейда): пока клетки едут, показываем
  // ожидание, а не редакторскую обвязку с палитрой и «Сохранить» — иначе в неё
  // успевали ткнуть и попадали в правку карты вместо игры.
  if (testing && !loaded)
    return (
      <div className="grid min-h-[60dvh] place-items-center p-6 text-sm text-muted-foreground">
        <span role="status">Открываем замок…</span>
      </div>
    );

  // «В город» = рейд: отдельного экрана города в игре нет (решение владельца 21.09).
  if (testing && loaded)
    return (
      <CastleLiveView
        cells={cells}
        assets={assets}
        onEdit={stopTesting}
        onCity={() => {
          if (dirty && !confirm("Есть несохранённые правки. Уйти без сохранения?")) return;
          void navigate({ to: "/beta-raid" });
        }}
        onSignedOut={() => void navigate({ to: "/" })}
      />
    );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-3 p-3">
      <CastleHeader
        dirty={dirty}
        saving={save.isPending}
        canSave={loaded}
        onSave={() => save.mutate(cells)}
        onTest={loaded ? () => setTesting(true) : undefined}
      />

      <CastlePalette
        assets={assets}
        kind={kind}
        onKind={(k) => {
          setKind(k);
          // Переключили слой — кисти нет, пока не выбрана: клик по клетке
          // ничего не делает, а не стирает слой молча.
          setBrush(null);
        }}
        brush={brush}
        onBrush={setBrush}
        mergeMode={mergeMode}
        onMergeMode={(on) => {
          setMergeMode(on);
          if (!on) grid.clearSelection();
        }}
        selectedCount={selected.size}
        onMerge={() => {
          const why = grid.mergeSelected();
          if (why) toast.error(why);
          else toast.success("Объединено в одну клетку");
        }}
        group={groupInfo}
        onScale={(dir) => activeGroup && grid.stepGroupScale(activeGroup, dir)}
        onUnmerge={() => {
          const key = Object.keys(cells).find((k) => cells[k].groupId === activeGroup);
          if (key) grid.unmerge(key);
        }}
        onAdd={() => setEditing({ kind, asset: null })}
        onEdit={(a) => setEditing({ kind, asset: a })}
      />

      <section className="rounded-2xl border border-border bg-card p-2">
        <div className="overflow-auto">
          {!loaded ? (
            <div className="grid place-items-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <CastleCanvas
              cells={cells}
              assetById={assetById}
              selected={selected}
              activeGroup={activeGroup}
              onCellClick={onCellClick}
            />
          )}
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
          Выбери картинку в палитре и тапай клетки. Ластик стирает только этот слой. «Объединить» —
          блок из 2–10 клеток под одно здание, у блока — масштаб картинки.
        </p>
      </section>

      {editing !== undefined && (
        <AssetModal
          kind={editing.kind}
          asset={editing.asset}
          onClose={() => setEditing(undefined)}
          onDelete={(a) => {
            setEditing(undefined);
            del.mutate(a);
          }}
          onSaved={(saved) => {
            setEditing(undefined);
            setBrush({ kind: saved.kind as CastleKind, assetId: saved.id });
            patchCache((p) => ({
              ...p,
              assets: [saved, ...p.assets.filter((x) => x.id !== saved.id)],
            }));
          }}
        />
      )}
    </div>
  );
}
