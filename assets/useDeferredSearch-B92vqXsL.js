import{r as o}from"./vendor-46dHRus9.js";function d(r,t,s){const e=o.useDeferredValue(t);return{filteredItems:o.useMemo(()=>r.filter(a=>s(a,e)),[r,e,s]),isStale:t!==e}}export{d as u};
