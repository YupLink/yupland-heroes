import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { createTransferGate, transferResult, type StorageSource } from '@/lib/storageTransfer';

type Move = { requested: number; sourceTotal?: number; source: StorageSource; send: () => Promise<number>; done?: () => void; details?: () => string };
export function useStorageMove(lang: string, refresh: () => Promise<void>, errorText: (e: unknown) => string, notify = true) {
  const gate = useRef(createTransferGate());
  const recovering = useRef(false);
  const [pending, setPending] = useState(false), [blocked, setBlocked] = useState(false), [message, setMessage] = useState('');
  const ru = lang === 'ru';
  const run = (op: Move) => gate.current.run(async () => {
    setPending(true); setMessage('');
    try {
      const moved = await op.send();
      if (!Number.isFinite(moved) || moved < 0 || moved > op.requested) throw new Error(ru ? 'Некорректный ответ о переносе.' : 'Invalid transfer receipt.');
      const text = [transferResult(op.requested, moved, op.sourceTotal, op.source, lang), op.details?.()].filter(Boolean).join(' ');
      setMessage(text); if (notify) toast(text, { duration: 8000 });
    } catch (e) {
      const text = `${errorText(e)} ${ru ? 'Проверь остаток перед следующим переносом.' : 'Check the remaining amount before another transfer.'}`;
      setMessage(text); if (notify) toast.error(text, { duration: 10000 });
    } finally { op.done?.(); }
  }, refresh).then(admitted => { if (admitted) { setBlocked(gate.current.blocked); setPending(false); if (gate.current.blocked && notify) showRecovery(); } return admitted; });
  const showRecovery = () => toast.error(ru ? 'Обнови остатки перед следующим переносом.' : 'Refresh balances before another transfer.', { duration: Infinity, action: { label: ru ? 'Обновить' : 'Refresh', onClick: () => void recover() } });
  const recover = async () => {
    if (recovering.current) return;
    recovering.current = true;
    setPending(true);
    await gate.current.recover(refresh);
    setBlocked(gate.current.blocked); setPending(false);
    recovering.current = false;
    if (gate.current.blocked && notify) showRecovery();
  };
  return { run, pending, blocked, message, recover, ru };
}

export function StorageMoveStatus({ move }: { move: ReturnType<typeof useStorageMove> }) {
  return <div className="space-y-2 text-sm" aria-live="polite">
    {move.message && <p role="status">{move.message}</p>}
    {move.pending && move.message && <p>{move.ru ? 'Обновляем остатки…' : 'Updating balances…'}</p>}
    {move.blocked && <p role="alert">{move.ru ? 'Данные не обновились. Перед следующим переносом обнови остатки.' : 'Data did not refresh. Refresh balances before another transfer.'} <button type="button" className="underline disabled:opacity-50" disabled={move.pending} onClick={() => void move.recover()}>{move.ru ? 'Обновить' : 'Refresh'}</button></p>}
  </div>;
}
