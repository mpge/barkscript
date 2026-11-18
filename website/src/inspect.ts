/** A small stand-in for Node's util.inspect, so the playground prints what `bark run` prints. */
export function inspect(value: unknown, depth = 0, seen = new Set<unknown>()): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  switch (typeof value) {
    case 'string':
      return depth === 0 ? value : `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
    case 'number':
      return Object.is(value, -0) ? '-0' : String(value);
    case 'bigint':
      return `${value}n`;
    case 'boolean':
    case 'symbol':
      return String(value);
    case 'function':
      return value.name ? `[Function: ${value.name}]` : '[Function (anonymous)]';
  }
  if (seen.has(value)) return '[Circular]';
  if (depth > 2) return Array.isArray(value) ? '[Array]' : '[Object]';
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      const items = value.slice(0, 100).map((v) => inspect(v, depth + 1, seen));
      if (value.length > 100) items.push(`... ${value.length - 100} more items`);
      return wrap('[', items, ']');
    }
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (value instanceof Map) {
      return `Map(${value.size}) ${wrap('{', [...value].map(([k, v]) => `${inspect(k, depth + 1, seen)} => ${inspect(v, depth + 1, seen)}`), '}')}`;
    }
    if (value instanceof Set) return `Set(${value.size}) ${wrap('{', [...value].map((v) => inspect(v, depth + 1, seen)), '}')}`;
    if (value instanceof Promise) return 'Promise { <pending> }';
    const entries = Object.entries(value as object);
    if (entries.length === 0) return '{}';
    return wrap(
      '{',
      entries.map(([k, v]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`}: ${inspect(v, depth + 1, seen)}`),
      '}',
    );
  } finally {
    seen.delete(value);
  }
}

function wrap(open: string, items: string[], close: string): string {
  const oneLine = `${open} ${items.join(', ')} ${close}`;
  if (oneLine.length <= 72 && !items.some((i) => i.includes('\n'))) return oneLine;
  return `${open}\n${items.map((i) => '  ' + i.replace(/\n/g, '\n  ')).join(',\n')}\n${close}`;
}
