// Логика страницы /storage: свой кошелёк, его контракты и вывод из хранилища.
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStorageConnector } from "@/lib/storageConnector";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";
import { formatYocto } from "@/components/wallet/format";
import { MIN_CLAIM, listManagedStores, probe, type StoreInfo } from "./storageChain";
import {
  connectExternal,
  disconnectExternal,
  listStorageSigners,
  sendClaim,
  type StorageSigner,
} from "./storageSigners";

const isCancel = (m: string) => /cancel|reject|close/i.test(m);

export function useStorageClaim() {
  const t = useT();
  const qc = useQueryClient();
  const [signers, setSigners] = useState<StorageSigner[] | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // контракт в работе
  // Ref, а не только state: двойной тап успевает до перерисовки.
  const inFlight = useRef(false);
  const userPicked = useRef(false);
  const [needPin, setNeedPin] = useState(false);
  const [needPwd, setNeedPwd] = useState(false);
  const [pin, setPin] = useState("");
  const [pwd, setPwd] = useState("");

  const refreshSigners = useCallback(async () => {
    const list = await listStorageSigners();
    setSigners(list);
    setOwner((cur) =>
      userPicked.current && cur && list.some((s) => s.accountId === cur)
        ? cur
        : (list[0]?.accountId ?? null),
    );
  }, []);

  useEffect(() => {
    void refreshSigners();
    let cancelled = false;
    let conn: Awaited<ReturnType<typeof getStorageConnector>> = null;
    const onChange = () => void refreshSigners();
    void getStorageConnector()
      .then((c) => {
        if (cancelled) return; // ушли раньше, чем коннектор загрузился
        conn = c;
        c?.on("wallet:signIn", onChange);
        c?.on("wallet:signOut", onChange);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      conn?.off("wallet:signIn", onChange);
      conn?.off("wallet:signOut", onChange);
    };
  }, [refreshSigners]);

  // Сменился кошелёк — PIN прошлого к нему не относится.
  useEffect(() => {
    setNeedPin(false);
    setPin("");
  }, [owner]);

  const list = useQuery({
    queryKey: ["nft-storage", owner],
    queryFn: () => listManagedStores(owner!),
    enabled: !!owner,
    staleTime: 30_000,
  });
  const signer = signers?.find((s) => s.accountId === owner) ?? null;

  const pickOwner = (id: string) => {
    userPicked.current = true;
    setOwner(id);
  };

  const connect = async () => {
    try {
      await connectExternal();
      userPicked.current = false; // только что подключённый — сразу выбран
      await refreshSigners();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (!isCancel(m)) toast.error(humanError(e));
    }
  };

  const disconnect = async () => {
    await disconnectExternal().catch(() => {});
    await refreshSigners();
  };

  const setClaimable = (contract: string, claimable: string) =>
    qc.setQueryData<StoreInfo[]>(["nft-storage", owner], (d) =>
      d?.map((s) => (s.contract === contract ? { ...s, claimable } : s)),
    );

  const claim = async (store: StoreInfo) => {
    if (!signer || signer.accountId !== owner || inFlight.current) return;
    // Флаг — до первого await: второй тап иначе успевает во вторую подпись.
    inFlight.current = true;
    setBusy(store.contract);
    try {
      if (signer.kind === "yuplink") {
        const appLock = await import("@/lib/appLock");
        if (appLock.hasAppPassword() && !appLock.isAppUnlocked()) {
          if (!pwd.trim()) {
            setNeedPwd(true);
            throw new Error("APP_LOCKED");
          }
          await appLock.unlockApp(pwd);
          setNeedPwd(false);
          setPwd("");
        }
        if (needPin && !pin.trim()) throw new Error("PIN_REQUIRED");
      }
      // Цифра на экране могла устареть: контракт при пустой копилке не падает,
      // а молча ничего не отдаёт — газ ушёл бы зря, а тост соврал бы «забрано».
      const fresh = await probe(store.contract, signer.accountId);
      if (!fresh || fresh.role !== "owner" || BigInt(fresh.claimable) < MIN_CLAIM) {
        setClaimable(store.contract, "0");
        throw new Error("storage.err_nothing");
      }
      if (signer.kind === "external") toast.message(t("storage.signing"));
      await sendClaim({
        signer,
        contract: store.contract,
        family: fresh.family,
        amount: fresh.claimable,
        pin: pin.trim() || undefined,
      });
      setNeedPin(false);
      setPin("");
      // Сразу видно, что забрали; точные цифры — следом с блокчейна.
      setClaimable(store.contract, "0");
      toast.success(t("storage.done", { n: formatYocto(fresh.claimable) }));
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (m === "APP_PWD_SETUP") {
        toast.error(t("wvault.need_setup"));
      } else if (m === "PIN_REQUIRED" || m.includes("Неверный PIN")) {
        setNeedPin(true);
        toast.error(t("storage.pin"));
      } else if (m === "APP_PWD_REQUIRED" || m === "APP_LOCKED") {
        setNeedPwd(true);
        toast.error(t("storage.app_pwd"));
      } else if (isCancel(m)) {
        toast.message(t("storage.cancelled"));
      } else {
        if (m === "storage.err_nothing") setClaimable(store.contract, "0");
        toast.error(humanError(e));
      }
    } finally {
      inFlight.current = false;
      setBusy(null);
      setTimeout(() => void qc.invalidateQueries({ queryKey: ["nft-storage"] }), 2500);
    }
  };

  return {
    signers,
    owner,
    signer,
    pickOwner,
    connect,
    disconnect,
    list,
    claim,
    busy,
    secrets: { needPin, needPwd, pin, pwd, setPin, setPwd },
  };
}
