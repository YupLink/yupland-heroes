// Что игрок видит: чужие лагеря на карте, юпиков в замке (профиль, 14.10.2026).
//
// Выбор хранится на аккаунте, а здесь — один источник на карту, замок и
// профиль. Переключатель срабатывает сразу (оптимистично), сервер догоняет;
// отказал — возвращаем как было. Ключ с кошельком сессии: на одном устройстве
// бывают разные аккаунты, а запись живёт и в persist-кэше — так вход
// сразу рисует карту по выбору, без мигания чужих лагерей.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSession } from "@/server/api/user-auth";
import { DEFAULT_VIEW, getAccountView, setAccountView, type AccountView } from "@/server/api/account-view";

const viewKey = (wallet: string) => ["account-view", wallet] as const;
const SET_KEY = ["account-view-set"] as const;

export function useAccountView(): AccountView {
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const wallet = session.data?.wallet ?? "";
  const view = useQuery({
    queryKey: viewKey(wallet),
    queryFn: () => getAccountView(),
    enabled: !!wallet,
    staleTime: 10 * 60_000,
  });
  return view.data ?? DEFAULT_VIEW;
}

export function useSetAccountView() {
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const key = viewKey(session.data?.wallet ?? "");
  return useMutation({
    mutationKey: SET_KEY,
    mutationFn: (patch: Partial<AccountView>) => setAccountView({ data: patch }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<AccountView>(key);
      qc.setQueryData<AccountView>(key, { ...(before ?? DEFAULT_VIEW), ...patch });
      return { before };
    },
    onError: (_e, _patch, ctx) => qc.setQueryData(key, ctx?.before ?? DEFAULT_VIEW),
    // Два быстрых нажатия: ответ первого не должен перебить второе.
    onSuccess: (saved) => {
      if (qc.isMutating({ mutationKey: SET_KEY }) <= 1) qc.setQueryData(key, saved);
    },
  });
}
