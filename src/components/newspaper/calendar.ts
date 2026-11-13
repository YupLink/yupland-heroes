export function monthOffset(month:string,offset:number){
 const [y,m]=month.split('-').map(Number);
 return new Date(Date.UTC(y,m-1+offset,1)).toISOString().slice(0,7);
}
export function calendarCells(month:string){
 const [y,m]=month.split('-').map(Number);
 const start=(new Date(Date.UTC(y,m-1,1)).getUTCDay()+6)%7;
 const days=new Date(Date.UTC(y,m,0)).getUTCDate();
 return Array.from({length:Math.ceil((start+days)/7)*7},(_,i)=>{
  const day=i-start+1;
  return day<1||day>days?null:{day,date:`${month}-${String(day).padStart(2,'0')}`};
 });
}
