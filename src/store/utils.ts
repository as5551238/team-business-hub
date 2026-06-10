let counter = Date.now();
const tabSalt = Math.random().toString(36).slice(2, 8);
export function genId(prefix: string) { return `${prefix}_${++counter}${tabSalt}`; }
