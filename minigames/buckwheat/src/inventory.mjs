// The standalone backpack lives in this browser; it does not write to the game API.
export function createInventory(storage,key='buckwheat-match3:crowns') {
  let total=0;
  try {const saved=Number(storage.getItem(key));if(Number.isSafeInteger(saved)&&saved>=0)total=saved;}catch{}
  const credited=new WeakMap();
  return {
    count:()=>total,
    collect(game){
      const crowns=Math.min(3,Math.max(0,Math.trunc(game.crowns)||0));
      const previous=credited.get(game)??0,earned=Math.max(0,crowns-previous);
      credited.set(game,Math.max(previous,crowns));
      if(earned){total+=earned;try{storage.setItem(key,String(total));}catch{}}
      return earned;
    }
  };
}
