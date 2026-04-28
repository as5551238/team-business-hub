let counter = Date.now();
export function genId(prefix: string) { return `${prefix}_${++counter}`; }
