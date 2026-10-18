import { Link, useLocation } from "@tanstack/react-router";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { YupLinkLogo } from "@/components/YupLinkLogo";
import { HeaderPrefs } from "@/components/HeaderPrefs";
import { disconnectWallet, getSession, prepareAddWallet, setNotificationsEnabled } from "@/server/api/user-auth";
import { listMySisterWallets, switchActiveWallet, unlinkSisterWallet } from "@/server/api/user-sisters";
import { createLoginCode } from "@/server/api/loginCode";
import { useState } from "react";
import { getConnector } from "@/lib/near-connector";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Wallet,
  ChevronDown,
  LogOut,
  Send,
  Copy,
  ShieldCheck,
  Plus,
  Check,
  Loader2,
  X,
  Bell,
  BellOff,
} from "lucide-react";
import { humanError } from "@/lib/humanError";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppHeaderProps {
  onConnectClick?: () => void;
}

function shortAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function AppHeader({ onConnectClick }: AppHeaderProps) {
  const { walletConnected, walletAddress, setWallet } = useAppStore();
  const setPendingAdd = useAppStore((s) => s.setPendingAddForWallet);
  const t = useT();
  const qc = useQueryClient();
  const [browserCode, setBrowserCode] = useState<string | null>(null);
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
  });

  const sisters = useQuery({
    queryKey: ["sister-wallets"],
    queryFn: () => listMySisterWallets(),
    enabled: walletConnected,
  });

  // Код для входа в браузере/на другом устройстве (полная автономность, без коша).
  const genCode = useMutation({
    mutationFn: () => createLoginCode(),
    onSuccess: (r) => {
      setBrowserCode(r.code);
      toast.success("Код на 5 минут — введи его в браузере на главной");
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const switchWallet = useMutation({
    mutationFn: (w: string) => switchActiveWallet({ data: { wallet: w } }),
    onSuccess: (res) => {
      setWallet(res.wallet);
      qc.invalidateQueries();
      toast.success(`Активен: ${shortAddress(res.wallet)}`);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const unlinkWallet = useMutation({
    mutationFn: (w: string) => unlinkSisterWallet({ data: { wallet: w } }),
    onSuccess: (res) => {
      qc.invalidateQueries();
      // Если отвязали активный — кош уже не «наш», UI должен предложить
      // подключиться заново.
      if (walletAddress && res.unlinked === walletAddress.toLowerCase()) {
        setWallet(null);
      }
      toast.success("Кошелёк отвязан — можешь подключить заново куда угодно");
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const toggleNotifs = useMutation({
    mutationFn: (enabled: boolean) =>
      setNotificationsEnabled({ data: { enabled } }),
    onSuccess: (_, enabled) => {
      qc.invalidateQueries({ queryKey: ["session"] });
      toast.success(enabled ? "Уведомления включены" : "Уведомления выключены");
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const addWallet = async () => {
    if (!walletAddress) return;
    try {
      // 1. Сервер выставляет cookie с TG-намерением (живёт 10 мин).
      await prepareAddWallet();
      // 2. Дублируем флаг в zustand на случай если cookie не дойдёт
      //    (Safari ITP и прочее).
      setPendingAdd(walletAddress);
      // 3. Перезапускаем connector — picker покажется заново.
      const connector = await getConnector();
      if (!connector) return;
      try {
        await connector.disconnect();
      } catch {
        // ignore — не было активной сессии
      }
      await connector.connect();
    } catch (err) {
      setPendingAdd(null);
      const msg = err instanceof Error ? err.message : String(err);
      if (!/cancel|reject|close/i.test(msg)) {
        toast.error(`Не удалось добавить: ${msg}`);
      }
    }
  };

  const disconnect = useMutation({
    mutationFn: async () => {
      const connector = await getConnector();
      if (connector) {
        try {
          await connector.disconnect();
        } catch {
          // Connector may refuse if there's no active session; ignore.
        }
      }
      return disconnectWallet();
    },
    onSuccess: () => {
      setWallet(null);
      qc.invalidateQueries();
      toast.success("Кошелёк отключён");
    },
  });

  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith("/admin");

  const copyAddress = () => {
    if (!walletAddress) return;
    navigator.clipboard
      .writeText(walletAddress)
      .then(() => toast.success("Адрес скопирован"))
      .catch(() => toast.error("Не удалось скопировать"));
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/home" className="flex items-center gap-2">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg gradient-gold shadow-gold">
            <YupLinkLogo className="h-5 w-5 text-gold-foreground" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-sm font-bold tracking-tight">
              YupLink
            </div>
            {isAdminRoute && (
              <div className="text-[10px] uppercase tracking-widest text-neon">
                Admin
              </div>
            )}
          </div>
        </Link>

        {walletConnected && walletAddress ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="group flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-3 py-1.5 text-xs font-medium transition hover:bg-gold/10">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                <span className="font-mono text-foreground">
                  {shortAddress(walletAddress)}
                </span>
                <ChevronDown className="h-3 w-3 text-muted-foreground transition group-hover:text-gold group-data-[state=open]:rotate-180" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-72 border-gold/20 bg-card"
            >
              <DropdownMenuLabel className="px-3 py-2">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t("header.address_label")}
                </div>
                <div className="mt-1 break-all font-mono text-xs text-foreground">
                  {walletAddress}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="px-3 py-2">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t("header.telegram_label")}
                </div>
                {session?.telegramLinked ? (
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <Send className="h-3 w-3 text-gold" />
                    <span className="text-foreground">
                      {session.telegramUsername
                        ? `@${session.telegramUsername}`
                        : t("header.telegram_linked")}
                    </span>
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("header.telegram_not_linked")}
                  </div>
                )}
              </DropdownMenuLabel>

              {/* Тумблер push-уведомлений в TG. Виден только если есть
                  привязка — иначе слать некуда. */}
              {session?.telegramLinked && (
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    if (toggleNotifs.isPending) return;
                    toggleNotifs.mutate(!session.notificationsEnabled);
                  }}
                  className="cursor-pointer px-3 py-2 text-xs"
                >
                  {toggleNotifs.isPending ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : session.notificationsEnabled ? (
                    <Bell className="mr-2 h-3.5 w-3.5 text-gold" />
                  ) : (
                    <BellOff className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span
                    className={
                      session.notificationsEnabled
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    {t("header.notifications")}:{" "}
                    {session.notificationsEnabled
                      ? t("header.notif_on")
                      : t("header.notif_off")}
                  </span>
                </DropdownMenuItem>
              )}

              {/* Вход в браузере по коду (полная автономность — без кошелька) */}
              <DropdownMenuSeparator />
              {browserCode ? (
                <div className="px-3 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Код для браузера (5 мин)
                  </div>
                  <div className="mt-1 select-all text-center font-display text-2xl font-bold tracking-[0.3em] text-gold">
                    {browserCode}
                  </div>
                  <div className="mt-1 text-center text-[10px] text-muted-foreground">
                    Открой сайт в браузере → «Войти по коду»
                  </div>
                </div>
              ) : (
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    genCode.mutate();
                  }}
                  className="cursor-pointer text-xs"
                >
                  {genCode.isPending ? "Генерирую…" : "Войти в браузере (код)"}
                </DropdownMenuItem>
              )}

              {/* Язык и «Уведомления в игре» */}
              <DropdownMenuSeparator />
              <HeaderPrefs />

              {/* Мульти-кошелёк: список всех кошельков того же TG */}
              {session?.telegramLinked &&
                sisters.data &&
                sisters.data.wallets.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                      {t("header.wallets_label", {
                        n: sisters.data.wallets.length,
                      })}
                    </DropdownMenuLabel>
                    {sisters.data.wallets.map((w) => {
                      return (
                        <div
                          key={w.wallet}
                          className="flex items-center px-3 py-1"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (!w.isActive) switchWallet.mutate(w.wallet);
                            }}
                            disabled={w.isActive}
                            className="flex flex-1 items-center text-left text-xs disabled:cursor-default"
                          >
                            {w.isActive ? (
                              <Check className="mr-2 h-3.5 w-3.5 shrink-0 text-gold" />
                            ) : switchWallet.isPending &&
                              switchWallet.variables === w.wallet ? (
                              <Loader2 className="mr-2 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                            ) : (
                              <span className="mr-2 inline-block h-3.5 w-3.5 shrink-0" />
                            )}
                            <span
                              className={
                                w.isActive
                                  ? "font-mono text-foreground"
                                  : "font-mono text-muted-foreground hover:text-foreground"
                              }
                            >
                              {shortAddress(w.wallet)}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const ok = window.confirm(
                                `Отвязать ${shortAddress(w.wallet)} от твоего Telegram?\n\nКошелёк можно будет подключить заново к этому же или другому TG-аккаунту.`
                              );
                              if (ok) unlinkWallet.mutate(w.wallet);
                            }}
                            disabled={
                              unlinkWallet.isPending &&
                              unlinkWallet.variables === w.wallet
                            }
                            aria-label="Отвязать"
                            title="Отвязать от Telegram"
                            className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                          >
                            {unlinkWallet.isPending &&
                            unlinkWallet.variables === w.wallet ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <X className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                    <DropdownMenuItem
                      onClick={addWallet}
                      className="cursor-pointer px-3 py-2 text-xs text-gold focus:bg-gold/10 focus:text-gold"
                    >
                      <Plus className="mr-2 h-3.5 w-3.5" />
                      {t("header.add_wallet")}
                    </DropdownMenuItem>
                  </>
                )}
              {session?.isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link
                      to="/admin"
                      className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 text-neon" />
                      {t("admin.title")}
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={copyAddress}
                className="cursor-pointer px-3 py-2 text-xs"
              >
                <Copy className="mr-2 h-3.5 w-3.5" />
                {t("header.copy_address")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
                className="cursor-pointer px-3 py-2 text-xs text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <LogOut className="mr-2 h-3.5 w-3.5" />
                {t("header.disconnect")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button
            onClick={onConnectClick}
            className="flex items-center gap-2 rounded-full gradient-gold px-4 py-1.5 text-xs font-bold text-gold-foreground shadow-gold transition hover:scale-105"
          >
            <Wallet className="h-3.5 w-3.5" />
            {t("auth.tg_login")}
          </button>
        )}
      </div>
    </header>
  );
}
