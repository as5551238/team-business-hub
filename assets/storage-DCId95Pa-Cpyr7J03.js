import{d as t,S as n}from"./index-QRFJMOcF.js";/**
 * @license lucide-react v1.8.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const c=[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]],k=t("check",c);/**
* @license lucide-react v1.8.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/const h=[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]],f=t("chevron-right",h);/**
* @license lucide-react v1.8.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/const i=[["path",{d:"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",key:"18887p"}]],v=t("message-square",i);/**
* @license lucide-react v1.8.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/const p=[["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}]],M=t("pen",p);/**
* @license lucide-react v1.8.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/const u=[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"M12 5v14",key:"s699le"}]],g=t("plus",u);/**
* @license lucide-react v1.8.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/const d=[["path",{d:"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z",key:"vktsd0"}],["circle",{cx:"7.5",cy:"7.5",r:".5",fill:"currentColor",key:"kqv944"}]],b=t("tag",d);/**
* @license lucide-react v1.8.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/const y=[["path",{d:"M10 11v6",key:"nco0om"}],["path",{d:"M14 11v6",key:"outv1u"}],["path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",key:"miytrc"}],["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",key:"e791ji"}]],z=t("trash-2",y),w={attachments:"attachments",templates:"templates",notes:"notes"};async function U(a,r,o){const e=n();if(!e)return console.error("Supabase client not initialized"),null;try{const{error:s}=await e.storage.from(a).upload(r,o,{cacheControl:"3600",upsert:!0});if(s)return console.error("Upload failed:",s.message),null;const{data:l}=e.storage.from(a).getPublicUrl(r);return l.publicUrl}catch(s){return console.error("Upload error:",s),null}}async function q(a,r){const o=n();if(!o)return console.error("Supabase client not initialized"),!1;try{const{error:e}=await o.storage.from(a).remove(r);return e?(console.error("Delete failed:",e.message),!1):!0}catch(e){return console.error("Delete error:",e),!1}}export{q as $,U as C,g as M,z as N,v as _,w as b,k as f,M as g,f as k,b as v};
