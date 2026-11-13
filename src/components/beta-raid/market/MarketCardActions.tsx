import type {ReactNode} from 'react';
import {Flame} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';

export function MarketCardActions({rush,label,children}:{rush:boolean;label:string;children:ReactNode}) {
  return <div className="raid-market-card-actions">
    {rush&&<Popover>
      <PopoverTrigger asChild><button type="button" className="raid-market-demand" aria-label={label}><Flame size={18} fill="currentColor" strokeWidth={0} aria-hidden="true"/></button></PopoverTrigger>
      <PopoverContent side="left" align="start" collisionPadding={8} sideOffset={5} className="raid-market-demand-tip">{label}</PopoverContent>
    </Popover>}
    {children}
  </div>;
}
