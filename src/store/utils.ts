let counter = Date.now();
let tabSalt = Math.random().toString(36).slice(2, 8);
export function genId(prefix: string) { return `${prefix}_${++counter}${tabSalt}`; }
