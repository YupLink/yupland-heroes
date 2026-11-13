export const decorStyleOptions=[{id:'base',ru:'Базовый',en:'Base'},{id:'elven',ru:'Эльфийский',en:'Elven'},{id:'winter',ru:'Зимний',en:'Winter'},{id:'infernal',ru:'Адский',en:'Infernal'},{id:'buckwheat',ru:'Гречневый',en:'Buckwheat'},{id:'celestial',ru:'Небесный',en:'Celestial'}];
export const isStyledDecor=(id?:string)=>!!id&&decorStyleOptions.slice(1).some(s=>id.startsWith(s.id+'-'));
