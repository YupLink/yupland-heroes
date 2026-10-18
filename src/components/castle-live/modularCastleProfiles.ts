// Local visual composition. No gameplay, ownership or construction rules.
export type Caption={x:number;y:number;font:number;height:number};
export type Point=[number,number];
export type Volume={base:Point[];height:number};
export type Building={caption:Caption;id:string;name:string;image:string;x:number;y:number;size:number;anchor:number;footprint:string;silhouette:string;lines:string[];volumes:Volume[]};
const footprint:Point[]=[[-.31,-.15],[0,-.27],[.33,-.09],[.04,.02]];
export function building(id:string,name:string,image:string,x:number,y:number,size:number,height:number,lines=[name]):Building{
  const base=footprint.map(([x,y]):Point=>[x*size,y*size]);
  return {id,name,image,x,y,size,anchor:.96,caption:{x:0,y:-8,font:12,height:lines.length>1?34:23},footprint:base.map(p=>p.join(',')).join(' '),silhouette:'.42,.04 .65,.08 .9,.42 .92,.82 .56,.97 .1,.82 .08,.43',lines,volumes:[{base,height:size*height}]};
}
export const originals:Building[]=[
  building('shop','Торговый дом','trading-house.png',155,530,220,.53),
  building('market','Рынок','market.png',615,470,285,.3),
  building('hall','Ратуша','town-hall.png',375,660,330,.35),
  building('tavern','Таверна','tavern.png',650,780,240,.55),
  building('temple','Храм','temple.png',320,905,225,.5),
  building('training','Тренировочный лагерь','training-camp.png',155,990,235,.25,['Тренировочный','лагерь']),
  building('warehouse','Склад','warehouse.png',550,1060,235,.42),
  building('glory','Слава','glory.png',135,1190,160,.7),
  building('notice','Задания','notice.png',675,1180,145,.5),
  building('gates','Выход в мир','gates.png',390,1275,330,.5),
];
const shop=originals[0];shop.caption={x:0,y:-21,font:13,height:23};
shop.silhouette='.33,.02 .56,.18 .65,.16 .71,.22 .73,.39 .88,.42 .84,.5 .86,.69 .71,.73 .73,.84 .5,.97 .23,.86 .22,.56 .18,.49 .23,.33';
const hall=originals[2];hall.caption={x:0,y:-8,font:15.5,height:26};
hall.silhouette='.38,.015 .57,.02 .58,.12 .47,.17 .62,.3 .8,.4 .92,.5 .93,.86 .61,.97 .13,.88 .13,.77 .24,.66 .24,.45 .32,.37 .32,.25 .37,.19';
hall.volumes=[{base:[[-112,-48],[47,-133],[189,-51],[15,15]].map(([x,y]):Point=>[x*330/476,y*330/476]),height:165*330/476},{base:[[-122,-65],[-57,-101],[4,-69],[-57,-34]].map(([x,y]):Point=>[x*330/476,y*330/476]),height:275*330/476}];
hall.footprint='-117,-51 33,-92 131,-35 10,10 -71,-3';
for(const b of originals){if(b.id!=='gates')b.y+=110;}
const glory=originals[7];glory.volumes[0].base=[[-35,-16],[0,-32],[35,-12],[0,3]];glory.footprint='-35,-16 0,-32 35,-12 0,3';
const gates=originals[9];gates.x=400;gates.y=330;gates.anchor=.86;
gates.silhouette='.18,.04 .3,.04 .38,.33 .64,.33 .69,.04 .81,.04 .88,.87 .67,.95 .63,.61 .38,.61 .33,.95 .12,.87';
gates.volumes=[{base:[[-128,-26],[-78,-43],[-30,-25],[-77,5]],height:180},{base:[[47,-26],[95,-43],[143,-25],[96,5]],height:180},{base:[[-45,-28],[53,-28],[53,-8],[-45,-8]],height:110}];
gates.footprint='-128,-26 -78,-43 143,-25 96,5 53,-8 -30,-25 -77,5';
// Bases traced against the actual opaque foundations in each square sprite.
// Coordinates stay in sprite space so resize preserves contact with the ground.
const bases:Record<string,Point[]>={
 shop:[[.24,.80],[.51,.64],[.75,.85],[.52,.972]],
 market:[[.105,.585],[.28,.48],[.91,.82],[.80,.922]],
 tavern:[[.195,.748],[.47,.61],[.80,.80],[.64,.895],[.54,.948],[.50,.945]],
 temple:[[.11,.70],[.46,.56],[.91,.735],[.58,.944],[.48,.95],[.34,.94],[.16,.85]],
 training:[[.025,.69],[.44,.51],[.972,.73],[.525,.979]],
 warehouse:[[.143,.702],[.46,.53],[.91,.75],[.65,.96],[.52,.912]],
 hall:[[.136,.897],[.14,.80],[.45,.66],[.91,.805],[.525,.974],[.41,.925],[.31,.971]],
 glory:[[.267,.87],[.50,.76],[.765,.879],[.486,.994]],
};
for(const b of originals){
 const points=bases[b.id];if(!points)continue;
 const base=points.map(([x,y]):Point=>[(x-.5)*b.size,(y-b.anchor)*b.size]);
 b.footprint=base.map(p=>p.join(',')).join(' ');
 b.volumes=[{base,height:b.size*({market:.32,training:.27,glory:.68}[b.id]??.5)}];
 if(b.id==='hall')b.volumes.push({base:[[.28,.80],[.38,.74],[.50,.81],[.40,.86]].map(([x,y]):Point=>[(x-.5)*b.size,(y-b.anchor)*b.size]),height:b.size*.8});
}
const notice=originals.find(b=>b.id==='notice')!;
notice.volumes=[[[.233,.713],[.295,.667],[.377,.71],[.308,.762]],[[.668,.913],[.753,.874],[.833,.919],[.746,.97]]].map(points=>({base:points.map(([x,y]):Point=>[(x-.5)*notice.size,(y-notice.anchor)*notice.size]),height:notice.size*.65}));
notice.footprint=notice.volumes.map(v=>v.base.map(p=>p.join(',')).join(' ')).join(' ');
export function resizeBuilding(b:Building,size:number){
 const ratio=size/b.size;
 b.volumes=b.volumes.map(v=>({height:v.height*ratio,base:v.base.map(([x,y]):Point=>[x*ratio,y*ratio])}));
 b.footprint=b.footprint.split(' ').map(p=>p.split(',').map(v=>Number(v)*ratio).join(',')).join(' ');
 b.size=size;
}
function hull(points:Point[]):Point[]{
  const p=[...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(o:Point,a:Point,b:Point)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const lower:Point[]=[],upper:Point[]=[];
  for(const v of p){while(lower.length>1&&cross(lower[lower.length-2],lower[lower.length-1],v)<=0)lower.pop();lower.push(v);}
  for(const v of [...p].reverse()){while(upper.length>1&&cross(upper[upper.length-2],upper[upper.length-1],v)<=0)upper.pop();upper.push(v);}
  return lower.slice(0,-1).concat(upper.slice(0,-1));
}
export function shadowPath(b:Building){
  // One filled path merges volume overlaps before opacity and blur.
  return b.volumes.map(({base,height})=>{
    const projection=base.map(([x,y]):Point=>[x+height*.42,y+height*.36]);
    return 'M'+hull([...base,...projection]).map(p=>p.join(',')).join('L')+'Z';
  }).join(' ');
}
export const captionMinimum=(b:Building)=>b.caption.font*(1+(b.lines.length-1)*1.15)+6;

// Owner-approved composition, 11 October 2026. Browser workshop state is not game state.
const approvedLayout=[{"caption": {"font": 12.000003125, "height": 23, "x": 0, "y": -8}, "id": "gates", "size": 330, "x": 402.99441146850586, "y": 330}, {"caption": {"font": 9.9999955, "height": 23, "x": 0, "y": -9}, "id": "shop", "size": 330, "x": 94.54320526123048, "y": 528}, {"caption": {"font": 12.000003125, "height": 23, "x": 0, "y": -8}, "id": "market", "size": 327.75, "x": 679.3486328125, "y": 573.5440368652344}, {"caption": {"font": 15.499984499999998, "height": 26, "x": 0, "y": -8}, "id": "hall", "size": 462, "x": 325.275634765625, "y": 687.3916320800781}, {"caption": {"font": 12.000003125, "height": 23, "x": 0, "y": -8}, "id": "tavern", "size": 384, "x": 582.33642578125, "y": 881.6302490234375}, {"caption": {"font": 12.000003125, "height": 23, "x": 0, "y": -8}, "id": "temple", "size": 303.75, "x": 100.08636474609376, "y": 899.287841796875}, {"caption": {"font": 12.000003125, "height": 23, "x": 0, "y": -8}, "id": "warehouse", "size": 317.25, "x": 510.5409851074219, "y": 1163.1043701171875}, {"caption": {"font": 12.000003125, "height": 34, "x": 0, "y": -8}, "id": "training", "size": 329, "x": 249.3389587402344, "y": 1197.7273559570312}, {"caption": {"font": 12.000003125, "height": 23, "x": 0, "y": -8}, "id": "glory", "size": 256, "x": 79.927734375, "y": 1329.7252197265625}, {"caption": {"font": 12.000003125, "height": 23, "x": 0, "y": -8}, "id": "notice", "size": 203, "x": 709.6239013671875, "y": 1330}];
for(const entry of approvedLayout){const b=originals.find(b=>b.id===entry.id)!;resizeBuilding(b,entry.size);b.x=entry.x;b.y=entry.y;b.caption={...entry.caption};}
