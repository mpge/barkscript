import type * as AST from './ast.js';
import type { CheckResult } from './checker.js';
import { VERSION } from './version.js';

/**
 * `script`: a complete Node.js program, runnable with `node out.js`.
 * `hosted`: a function body for a host (the CLI runner, the playground) that supplies
 *           `__host.ask`, `console` and `process`, and runs it inside an async function.
 */
export type CodegenMode = 'script' | 'hosted';

export interface CodegenOptions {
  mode: CodegenMode;
  filename?: string;
}

export interface CodegenResult {
  code: string;
  /** lineMap[jsLine - 1] = .bark line that produced it (0 when generated). */
  lineMap: number[];
}

/** Words JavaScript reserves; BarkScript names that collide get a trailing underscore. */
const JS_RESERVED = new Set([
  'arguments', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'enum', 'eval', 'export', 'extends', 'false', 'finally', 'for', 'function',
  'if', 'implements', 'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null', 'package',
  'private', 'protected', 'public', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true',
  'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'async', 'of', 'require', 'module', 'exports',
]);

/** Globals the generated code relies on; a program that declares one gets it renamed. */
const SHADOWABLE = new Set(['console', 'process', 'Math', 'Number', 'String', 'Promise', 'setTimeout']);

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// JavaScript operator precedence, higher binds tighter.
const PREC = {
  arrow: 2,
  or: 3,
  and: 4,
  equality: 8,
  relational: 9,
  additive: 11,
  multiplicative: 12,
  unary: 14,
  postfix: 17,
  primary: 20,
} as const;

const BINARY_PREC: Record<AST.BinaryExpression['operator'], number> = {
  '==': PREC.equality,
  '!=': PREC.equality,
  '<': PREC.relational,
  '>': PREC.relational,
  '<=': PREC.relational,
  '>=': PREC.relational,
  '+': PREC.additive,
  '-': PREC.additive,
  '*': PREC.multiplicative,
  '/': PREC.multiplicative,
  '%': PREC.multiplicative,
};

const JS_OPERATOR: Record<string, string> = { '==': '===', '!=': '!==' };

interface Line {
  text: string;
  source: number;
}

export function generate(program: AST.Program, facts: CheckResult, options: CodegenOptions): CodegenResult {
  return new Generator(program, facts, options).run();
}

class Generator {
  private readonly lines: Line[] = [];
  private indent = 0;
  private readonly taken: Set<string>;
  private readonly helpers: { sleep: string; ask: string; input: string };
  private repeatDepth = 0;

  constructor(
    private readonly program: AST.Program,
    private readonly facts: CheckResult,
    private readonly options: CodegenOptions,
    parent?: Generator,
  ) {
    if (parent) {
      this.taken = parent.taken;
      this.helpers = parent.helpers;
      this.repeatDepth = parent.repeatDepth;
    } else {
      this.taken = new Set([...facts.declared].map((name) => this.name(name)));
      this.helpers = { sleep: this.fresh('sleep'), ask: this.fresh('ask'), input: this.fresh('input') };
    }
  }

  /** A name that no user declaration uses. */
  private fresh(base: string): string {
    let candidate = base;
    for (let n = 2; this.taken.has(candidate); n++) candidate = `${base}${n}`;
    this.taken.add(candidate);
    return candidate;
  }

  private name(name: string): string {
    return JS_RESERVED.has(name) || (SHADOWABLE.has(name) && this.facts.declared.has(name)) ? `${name}_` : name;
  }

  private emit(text: string, source = 0): void {
    this.lines.push({ text: text ? '  '.repeat(this.indent) + text : '', source });
  }

  private blank(): void {
    const last = this.lines[this.lines.length - 1];
    if (last && last.text !== '' && !last.text.endsWith('{')) this.emit('');
  }

  run(): CodegenResult {
    const { mode, filename } = this.options;
    const script = mode === 'script';
    this.emit(`// Compiled from ${filename ?? 'BarkScript'} by BarkScript ${VERSION}.`);
    if (script) this.emit(`"use strict";`);
    this.prelude();

    const wrap = script && this.program.async;
    if (wrap) {
      this.blank();
      this.emit('(async () => {');
      this.indent++;
    } else {
      this.blank();
    }
    this.statements(this.program.body, true);
    if (wrap) {
      this.indent--;
      this.emit(this.facts.usesBeg ? `})().finally(() => ${this.helpers.input}?.close());` : '})();');
    }
    return {
      code: this.lines.map((l) => l.text).join('\n') + '\n',
      lineMap: this.lines.map((l) => l.source),
    };
  }

  private prelude(): void {
    const script = this.options.mode === 'script';
    const { sleep, ask, input } = this.helpers;
    const block = (lines: string[]) => {
      this.blank();
      lines.forEach((line) => this.emit(line));
    };
    if (this.facts.usesWait) {
      block([`const ${sleep} = (ms) => new Promise((resolve) => setTimeout(resolve, ms));`]);
    }
    if (this.facts.builtins.has('random')) {
      block([
        'function random(min, max) {',
        '  min = Math.ceil(min);',
        '  max = Math.floor(max);',
        '  return Math.floor(Math.random() * (max - min + 1)) + min;',
        '}',
      ]);
    }
    if (this.facts.builtins.has('number')) {
      block([
        'function number(value) {',
        '  const text = String(value).trim();',
        '  return text === "" ? NaN : Number(text);',
        '}',
      ]);
    }
    if (this.facts.builtins.has('treats')) {
      if (script) {
        // The same behaviour as src/treats.ts, written out so the file runs on its own.
        block([
          'const treats = (() => {',
          '  let shelf;',
          '  try {',
          '    if (typeof window !== "undefined" && window.localStorage) shelf = window.localStorage;',
          '  } catch {}',
          '  if (!shelf) {',
          '    const items = new Map();',
          '    shelf = {',
          '      getItem: (name) => items.get(name) ?? null,',
          '      setItem: (name, value) => items.set(name, value),',
          '      removeItem: (name) => items.delete(name),',
          '    };',
          '  }',
          '  return {',
          '    bury(name, value) {',
          '      shelf.setItem(String(name), JSON.stringify(value) ?? "null");',
          '    },',
          '    grab(name) {',
          '      const raw = shelf.getItem(String(name));',
          '      if (raw === null) return null;',
          '      try {',
          '        return JSON.parse(raw);',
          '      } catch {',
          '        return raw;',
          '      }',
          '    },',
          '    eat(name) {',
          '      shelf.removeItem(String(name));',
          '    },',
          '  };',
          '})();',
        ]);
      } else {
        block(['const treats = __host.treats;']);
      }
    }
    if (this.facts.usesBeg) {
      if (script) {
        block([
          `let ${input};`,
          `function ${ask}(question = "") {`,
          `  process.stdout.write(String(question));`,
          `  if (!${input}) {`,
          `    const lines = [];`,
          `    const waiting = [];`,
          `    let closed = false;`,
          `    const rl = process.getBuiltinModule("node:readline").createInterface({ input: process.stdin });`,
          `    rl.on("line", (line) => (waiting.length ? waiting.shift()(line) : lines.push(line)));`,
          `    rl.on("close", () => {`,
          `      closed = true;`,
          `      while (waiting.length) waiting.shift()("");`,
          `    });`,
          `    ${input} = {`,
          `      next: () => new Promise((resolve) => (lines.length ? resolve(lines.shift()) : closed ? resolve("") : waiting.push(resolve))),`,
          `      close: () => rl.close(),`,
          `    };`,
          `  }`,
          `  return ${input}.next();`,
          `}`,
        ]);
      } else {
        block([`const ${ask} = __host.ask;`]);
      }
    }
  }

  // ------------------------------------------------------------ statements

  private statements(body: AST.Statement[], topLevel = false): void {
    let previous: AST.Statement | undefined;
    for (const statement of body) {
      const isFn = statement.kind === 'FunctionDeclaration';
      const gap = previous && statement.loc.line > (previous.loc.endLine ?? previous.loc.line) + 1;
      if (previous && (gap || (topLevel && (isFn || previous.kind === 'FunctionDeclaration')))) this.blank();
      this.statement(statement);
      previous = statement;
    }
  }

  private body(statements: AST.Statement[]): void {
    this.indent++;
    this.statements(statements);
    this.indent--;
  }

  private statement(s: AST.Statement): void {
    const line = s.loc.line;
    const emit = (text: string) => this.emit(text, line);
    switch (s.kind) {
      case 'VariableDeclaration': {
        const keyword = s.constant ? 'const' : 'let';
        const init = s.init ? ` = ${this.expression(s.init, PREC.arrow)}` : '';
        this.emitMultiline(`${keyword} ${this.name(s.name.name)}${init};`, line);
        return;
      }
      case 'Print':
        this.emitMultiline(`console.log(${s.args.map((a) => this.expression(a, PREC.arrow)).join(', ')});`, line);
        return;
      case 'FunctionDeclaration':
        emit(`${s.async ? 'async ' : ''}function ${this.name(s.name.name)}(${s.params.map((p) => this.name(p.name)).join(', ')}) {`);
        this.body(s.body);
        emit('}');
        return;
      case 'CallStatement':
        this.emitMultiline(`${this.expression(s.call, 0)};`, line);
        return;
      case 'BegStatement':
        emit(`${this.expression(s.beg, 0)};`);
        return;
      case 'Return':
        this.emitMultiline(s.value ? `return ${this.expression(s.value, 0)};` : 'return;', line);
        return;
      case 'If':
        s.branches.forEach((branch, i) => {
          const head = `if (${this.expression(branch.test, 0)}) {`;
          if (i === 0) this.emit(head, branch.loc.line);
          else this.emit(`} else ${head}`, branch.loc.line);
          this.body(branch.body);
        });
        if (s.otherwise) {
          emit('} else {');
          this.body(s.otherwise);
        }
        emit('}');
        return;
      case 'Repeat': {
        const counter = this.fresh(['i', 'j', 'k'][this.repeatDepth] ?? 'n');
        if (s.count.kind === 'Number') {
          emit(`for (let ${counter} = 0; ${counter} < ${this.expression(s.count, PREC.relational + 1)}; ${counter}++) {`);
        } else {
          const times = this.fresh('times');
          emit(`for (let ${counter} = 0, ${times} = ${this.expression(s.count, PREC.arrow)}; ${counter} < ${times}; ${counter}++) {`);
          this.taken.delete(times);
        }
        this.repeatDepth++;
        this.body(s.body);
        this.repeatDepth--;
        this.taken.delete(counter);
        emit('}');
        return;
      }
      case 'While':
        emit(`while (${s.test ? this.expression(s.test, 0) : 'true'}) {`);
        this.body(s.body);
        emit('}');
        return;
      case 'Each':
        emit(`for (const ${this.name(s.name.name)} of ${this.expression(s.iterable, PREC.arrow)}) {`);
        this.body(s.body);
        emit('}');
        return;
      case 'Range':
        emit(this.rangeHead(s));
        this.body(s.body);
        emit('}');
        return;
      case 'Break':
        emit('break;');
        return;
      case 'Continue':
        emit('continue;');
        return;
      case 'Wait': {
        let ms: string;
        if (s.unit === 'ms') ms = this.expression(s.duration, 0);
        else if (s.duration.kind === 'Number') ms = String(s.duration.value * 1000);
        else ms = `${this.expression(s.duration, PREC.multiplicative)} * 1000`;
        emit(`await ${this.helpers.sleep}(${ms});`);
        return;
      }
      case 'Exit':
        emit('process.exit(0);');
        return;
      case 'Assignment':
        this.emitMultiline(`${this.expression(s.target, PREC.postfix)} ${s.operator} ${this.expression(s.value, PREC.arrow)};`, line);
        return;
    }
  }

  /** Expressions containing unnamed fetches span several lines; indent each one. */
  private emitMultiline(text: string, source: number): void {
    for (const part of text.split('\n')) this.emit(part, source);
  }

  private rangeHead(s: AST.RangeLoop): string {
    const i = this.name(s.name.name);
    const from = this.expression(s.from, PREC.arrow);
    const literal = (e?: AST.Expression) =>
      e?.kind === 'Number' ? e.value : e?.kind === 'Unary' && e.operator === '-' && e.argument.kind === 'Number' ? -e.argument.value : undefined;
    const fromValue = literal(s.from);
    const toValue = literal(s.to);
    const stepValue = s.step ? literal(s.step) : undefined;

    let to = this.expression(s.to, PREC.relational + 1);
    let init = `let ${i} = ${from}`;
    if (toValue === undefined && s.to.kind !== 'Identifier') {
      const last = this.fresh('last');
      init += `, ${last} = ${this.expression(s.to, PREC.arrow)}`;
      to = last;
    }

    if (s.step && stepValue === undefined) {
      const step = this.fresh('step');
      return `for (${init}, ${step} = ${this.expression(s.step, PREC.arrow)}; ${step} > 0 ? ${i} <= ${to} : ${i} >= ${to}; ${i} += ${step}) {`;
    }
    const down = stepValue !== undefined ? stepValue < 0 : fromValue !== undefined && toValue !== undefined && fromValue > toValue;
    const size = stepValue === undefined ? 1 : Math.abs(stepValue);
    const update = size === 1 ? `${i}${down ? '--' : '++'}` : `${i} ${down ? '-=' : '+='} ${size}`;
    return `for (${init}; ${i} ${down ? '>=' : '<='} ${to}; ${update}) {`;
  }

  // ----------------------------------------------------------- expressions

  private wrap(code: string, prec: number, min: number): string {
    return prec < min ? `(${code})` : code;
  }

  private expression(e: AST.Expression, min: number): string {
    switch (e.kind) {
      case 'Number': {
        const raw = e.raw.replace(/_/g, '');
        return /^0\d/.test(raw) ? String(e.value) : e.raw;
      }
      case 'String':
        return JSON.stringify(e.value);
      case 'Template':
        return this.template(e);
      case 'Boolean':
        return e.value ? 'true' : 'false';
      case 'Null':
        return 'null';
      case 'Identifier':
        return this.name(e.name);
      case 'Binary': {
        const prec = BINARY_PREC[e.operator];
        const op = JS_OPERATOR[e.operator] ?? e.operator;
        return this.wrap(`${this.expression(e.left, prec)} ${op} ${this.expression(e.right, prec + 1)}`, prec, min);
      }
      case 'Logical': {
        const prec = e.operator === 'or' ? PREC.or : PREC.and;
        const op = e.operator === 'or' ? '||' : '&&';
        return this.wrap(`${this.expression(e.left, prec)} ${op} ${this.expression(e.right, prec + 1)}`, prec, min);
      }
      case 'Unary': {
        let arg = this.expression(e.argument, PREC.unary);
        if (e.operator === '-' && arg.startsWith('-')) arg = `(${arg})`;
        return this.wrap(`${e.operator === 'not' ? '!' : '-'}${arg}`, PREC.unary, min);
      }
      case 'Call': {
        const callee = this.expression(e.callee, PREC.postfix);
        const call = `${callee}(${e.args.map((a) => this.expression(a, PREC.arrow)).join(', ')})`;
        return e.awaited ? this.wrap(`await ${call}`, PREC.unary, min) : call;
      }
      case 'New': {
        const callee = this.expression(e.callee, PREC.postfix);
        const wrapped = e.callee.kind === 'Call' || e.callee.kind === 'Index' ? `(${callee})` : callee;
        return `new ${wrapped}(${e.args.map((a) => this.expression(a, PREC.arrow)).join(', ')})`;
      }
      case 'Member': {
        const object = e.object.kind === 'Number' ? `(${this.expression(e.object, 0)})` : this.expression(e.object, PREC.postfix);
        return IDENT.test(e.property) ? `${object}.${e.property}` : `${object}[${JSON.stringify(e.property)}]`;
      }
      case 'Index':
        return `${this.expression(e.object, PREC.postfix)}[${this.expression(e.index, 0)}]`;
      case 'Array':
        return `[${e.elements.map((el) => this.expression(el, PREC.arrow)).join(', ')}]`;
      case 'Object':
        if (e.entries.length === 0) return '{}';
        return `{ ${e.entries
          .map((entry) => `${IDENT.test(entry.key) && !/^\d/.test(entry.key) ? entry.key : JSON.stringify(entry.key)}: ${this.expression(entry.value, PREC.arrow)}`)
          .join(', ')} }`;
      case 'FunctionExpression':
        return this.wrap(this.functionExpression(e), PREC.arrow, min);
      case 'Beg':
        return this.wrap(`await ${this.helpers.ask}(${e.prompt ? this.expression(e.prompt, PREC.arrow) : ''})`, PREC.unary, min);
    }
  }

  private template(e: AST.TemplateLiteral): string {
    let out = '`';
    for (const part of e.parts) {
      if (typeof part === 'string') out += part.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/\r/g, '\\r').replace(/\0/g, '\\0');
      else out += '${' + this.expression(part, 0) + '}';
    }
    return out + '`';
  }

  private functionExpression(e: AST.FunctionExpression): string {
    const params = `(${e.params.map((p) => this.name(p.name)).join(', ')})`;
    const prefix = e.async ? 'async ' : '';
    const only = e.body.length === 1 ? e.body[0] : undefined;
    if (only?.kind === 'Return' && only.value) {
      const value = this.expression(only.value, PREC.arrow);
      return `${prefix}${params} => ${only.value.kind === 'Object' ? `(${value})` : value}`;
    }
    // Render the body with a nested generator so indentation is correct.
    const nested = new Generator(this.program, this.facts, this.options, this);
    nested.indent = 1;
    nested.statements(e.body);
    const inner = nested.lines.map((l) => l.text).join('\n');
    const pad = '  '.repeat(this.indent);
    const body = e.body.length ? `{\n${inner.split('\n').map((l) => (l ? pad + l : l)).join('\n')}\n${pad}}` : '{}';
    return `${prefix}${params} => ${body}`;
  }
}
