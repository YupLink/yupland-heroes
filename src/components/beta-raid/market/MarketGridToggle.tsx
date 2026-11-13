import {useState} from 'react';
export type Columns=1|2|3;
const key='yuplink.raid-shops.columns.v1';
export function useGridColumns(){
  const [columns,setColumns]=useState<Columns>(()=>{
    try{const n=Number(localStorage.getItem(key));return n===1||n===2||n===3?n:2;}catch{return 2;}
  });
  function cycle(){
    setColumns(current=>{const next:Columns=current===3?1:current===1?2:3;
      try{localStorage.setItem(key,String(next));}catch{/* The layout still works without storage. */}
      return next;
    });
  }
  return {columns,cycle};
}
export function GridViewToggle({columns,onClick,en}:{columns:Columns;onClick:()=>void;en:boolean}){
  const next=columns===3?1:columns+1;
  const label=en?`View: ${columns} per row. Switch to ${next} per row`:`Вид: ${columns} в ряд. Переключить на ${next} в ряд`;
  const rows=columns===1?3:columns;
  const width=columns===1?14:columns===2?6:4;
  const height=columns===1?3:width;
  const gap=columns===1?3:2;
  return <button type="button" className="raid-market-view-toggle" onClick={onClick} aria-label={label} title={label}>
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      {Array.from({length:rows*columns},(_,i)=><rect key={i} x={3+(i%columns)*(width+gap)} y={3+Math.floor(i/columns)*(height+gap)} width={width} height={height} rx=".6"/>)}
    </svg>
  </button>;
}
