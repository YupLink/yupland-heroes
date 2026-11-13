// Логика страницы /burn: кошелёк, список NFT, выбор и само сжигание.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listBurnableNfts, type BurnGroup } from "@/server/api/nft-burn";
import { getConnector } from "@/lib/near-connector";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { listBurnSigners, sendBurn, type BurnSigner } from "./burnSigners";
import { pickTokenIds, setQty, withoutBurned, type BurnQty } from "./burnPlan";

type BurnData = { contract: string; groups: BurnGroup[] };

/**
 * Модальный диалог (Radix), пока открыт, ставит body { pointer-events: none }.
 * Окно HOT коннектор вешает в тот же body — и оно становилось ненажимаемым
 * (17.10, «нажать ничего невозможно»). Перед вызовом внешнего кошелька
 * подтверждение закрываем и ждём, пока страница снова примет нажатия.
 */
async function waitPageClickable(maxMs = 800): Promise<void> {
  const t0 = performance.now();
  while (document.body.style.pointerEvents === "none" && performance.now() - t0 < maxMs) {
    await new Promise((r) => setTimeout(r, 30));
  }
  if (document.body.style.pointerEvents === "none") document.body.style.pointerEvents = "";
}

export function useNftBurn() {
  const t = useT();
  const qc = useQueryClient();
  const sessionWallet = useAppStore((s) => s.walletAddress);
  const [signers, setSigners] = useState<BurnSigner[] | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [qty, setQtyState] = useState<BurnQty>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Ref, а не только state: двойной тап успевает до перерисовки.
  const inFlight = useRef(false);
  // Пока человек сам не выбрал кошелёк — держим кошелёк сессии (он первым в списке).
  const userPicked = useRef(false);
  const [needPin, setNeedPin] = useState(false);
  const [needPwd, setNeedPwd] = useState(false);

  // Подключение — общее с приложением: подхватываем его события, не создаём своё.
  const refreshSigners = useCallback(async () => {
    const list = await listBurnSigners(sessionWallet);
    setSigners(list);
    setOwner((cur) =>
      userPicked.current && cur && list.some((s) => s.accountId === cur)
        ? cur
        : (list[0]?.accountId ?? null),
    );
  }, [sessionWallet]);

  useEffect(() => {
    void refreshSigners();
    let cancelled = false;
    let conn: Awaited<ReturnType<typeof getConnector>> = null;
    const onChange = () => void refreshSigners();
    void getConnector().then((c) => {
      if (cancelled) return; // ушли раньше, чем коннектор загрузился
      conn = c;
      c?.on("wallet:signIn", onChange);
      c?.on("wallet:signOut", onChange);
    });
    return () => {
      cancelled = true;
      conn?.off("wallet:signIn", onChange);
      conn?.off("wallet:signOut", onChange);
    };
  }, [refreshSigners]);

  // Выбор — по названиям, а одинаковые названия есть у любого кошелька
  // коллекции: сменился кошелёк (в том числе сам, в HOT) — выбор и окно
  // подтверждения сбрасываем, иначе сгорели бы те же названия у другого.
  useEffect(() => {
    setQtyState({});
    setConfirmOpen(false);
  }, [owner]);

  const queryKey = useMemo(() => ["burn-nfts", owner] as const, [owner]);
  const list = useQuery({
    queryKey,
    queryFn: () => listBurnableNfts({ data: { owner: owner! } }) as Promise<BurnData>,
    enabled: !!owner,
    staleTime: 30_000,
  });
  const groups = useMemo(() => list.data?.groups ?? [], [list.data]);
  const signer = signers?.find((s) => s.accountId === owner) ?? null;
  // Что реально уйдёт в транзакцию: после обновления списка копий могло стать меньше.
  const selectedIds = useMemo(() => pickTokenIds(groups, qty), [groups, qty]);
  const total = selectedIds.length;

  const changeQty = useCallback(
    (g: BurnGroup, want: number) => setQtyState((q) => setQty(q, g, want)),
    [],
  );

  const pickOwner = (id: string) => {
    userPicked.current = true;
    setOwner(id);
  };

  const connect = async () => {
    try {
      await (await getConnector())?.connect();
      await refreshSigners();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (!/cancel|reject|close/i.test(m)) toast.error(humanError(e));
    }
  };

  const openConfirm = async () => {
    if (total === 0 || !signer) return;
    if (signer.kind === "yuplink") {
      const { hasAppPassword, isAppUnlocked } = await import("@/lib/appLock");
      setNeedPwd(hasAppPassword() && !isAppUnlocked());
    } else setNeedPwd(false);
    setConfirmOpen(true);
  };

  const burn = async (secrets: { pin?: string; pwd?: string }) => {
    if (!signer || signer.accountId !== owner || !list.data || inFlight.current) return;
    const tokenIds = selectedIds;
    if (tokenIds.length === 0) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (secrets.pwd) await (await import("@/lib/appLock")).unlockApp(secrets.pwd);
      if (signer.kind === "external") {
        setConfirmOpen(false);
        await waitPageClickable();
        toast.message(t("burn.signing"));
      }
      const res = await sendBurn({
        signer,
        contract: list.data.contract,
        tokenIds,
        pin: secrets.pin,
      });
      if (res.burned.length > 0) {
        const gone = new Set(res.burned);
        qc.setQueryData<BurnData>(queryKey, (d) =>
          d ? { ...d, groups: withoutBurned(d.groups, gone) } : d,
        );
      }
      setQtyState({});
      setConfirmOpen(false);
      setNeedPin(false);
      if (res.failed) toast.error(t("burn.partial", { ok: res.burned.length, n: tokenIds.length }));
      else toast.success(t("burn.done", { n: tokenIds.length }));
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (m === "APP_PWD_SETUP") {
        toast.error(t("wvault.need_setup"));
      } else if (m === "PIN_REQUIRED" || m.includes("Неверный PIN")) {
        setNeedPin(true);
        toast.error(t("burn.pin"));
      } else if (m === "APP_PWD_REQUIRED" || m === "APP_LOCKED") {
        setNeedPwd(true);
        toast.error(t("burn.app_pwd"));
      } else if (/cancel|reject|close/i.test(m)) {
        toast.message(t("burn.cancelled"));
      } else {
        toast.error(humanError(e));
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
      // Правда — в блокчейне: через пару секунд перечитываем список оттуда.
      setTimeout(() => void qc.invalidateQueries({ queryKey: ["burn-nfts"] }), 2500);
    }
  };

  return {
    signers,
    owner,
    pickOwner,
    connect,
    list,
    groups,
    qty,
    total,
    changeQty,
    clear: () => setQtyState({}),
    confirmOpen,
    openConfirm,
    closeConfirm: () => setConfirmOpen(false),
    burn,
    busy,
    needPin,
    needPwd,
  };
}
