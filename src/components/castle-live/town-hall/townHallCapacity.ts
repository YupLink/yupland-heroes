export type Level = {level:number; purchaseLimit:number; priceId:string};
export function capacityState(levels:Level[], level:number, used:number) {
 const ordered=[...levels].sort((a,b)=>a.level-b.level);
 const valid=ordered.length>0 && ordered.every((v,i)=>Number.isSafeInteger(v.level)&&v.level>0&&Number.isSafeInteger(v.purchaseLimit)&&v.purchaseLimit>=0&&typeof v.priceId==="string"&&v.priceId.length>0&&(!i || v.level>ordered[i-1].level&&v.purchaseLimit>ordered[i-1].purchaseLimit));
 const index=ordered.findIndex(v=>v.level===level);
 if(!valid||index<0||!Number.isSafeInteger(used)||used<0) return null;
 const current=ordered[index], next=ordered[index+1]??null;
 return {current,next,used,remaining:Math.max(0,current.purchaseLimit-used),gain:next?next.purchaseLimit-current.purchaseLimit:0};
}
export function buildGate(state:ReturnType<typeof capacityState>,priced:boolean,owned:boolean){
 if(owned)return "owned";
 if(!state)return "unavailable";
 if(state.remaining===0)return state.next?"expand":"maximum";
 return priced?"confirm":"soon";
}
