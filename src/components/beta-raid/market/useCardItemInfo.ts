import {useEffect, useRef, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {getItemInfo} from '@/server/api/beta-raid/item-info';
import {itemInfoContent} from './itemInfoContent';
import {boostEffectText, type BoostEffect} from '@/lib/hero/boost';

/** Read only visible cards, sharing both requests and cache with the info modal. */
export function useCardItemInfo(id: string | null, lang: string, boost?: BoostEffect[] | null) {
  const cardRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = cardRef.current;
    if (!node || !id) return;
    if (typeof IntersectionObserver === 'undefined') {setVisible(true); return;}
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {setVisible(true); observer.disconnect();}
    }, {rootMargin: '100px'});
    observer.observe(node);
    return () => observer.disconnect();
  }, [id]);
  const query = useQuery({
    queryKey: ['item-info', id],
    queryFn: () => getItemInfo({data: {id: id!}}),
    enabled: !!id && visible,
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const content = itemInfoContent(query.data ? {...query.data, boost: query.data.boost ?? boost} : null, lang);
  const knownBoost = boost?.map(effect => boostEffectText(effect, lang === 'en' ? 'en' : 'ru')) ?? [];
  return {cardRef, lines: content.lines.length ? content.lines : knownBoost, hasDetails: content.hasDetails || !!knownBoost.length,
    isError: !!id && query.isError, loading: !!id && visible && query.isFetching};
}
