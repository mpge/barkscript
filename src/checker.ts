import type * as AST from './ast.js';
import { BarkError, closest, DOG, type SourceLocation } from './errors.js';
import { BUILTINS } from './tokens.js';

/** JavaScript globals a BarkScript program may use directly. */
export const JS_GLOBALS = new Set([
  'Math', 'JSON', 'Date', 'Number', 'String', 'Boolean', 'Array', 'Object', 'Map', 'Set', 'Promise',
  'RegExp', 'Error', 'Symbol', 'BigInt', 'Intl', 'console', 'parseInt', 'parseFloat', 'isNaN',
  'isFinite', 'Infinity', 'NaN', 'undefined', 'globalThis', 'encodeURIComponent', 'decodeURIComponent',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'structuredClone',
]);

const JS_LITERALS: Record<string, string> = {
  true: 'good boy',
  false: 'bad dog',
  null: 'empty bowl',
};

type SymbolKind = 'variable' | 'constant' | 'function' | 'parameter' | 'each' | 'range';

interface BarkSymbol {
  name: string;
  kind: SymbolKind;
  loc: SourceLocation;
  ready: boolean;
  fn?: AST.FunctionDeclaration;
}

class Scope {
  readonly symbols = new Map<string, BarkSymbol>();
  constructor(readonly parent?: Scope) {}

  lookup(name: string): BarkSymbol | undefined {
    return this.symbols.get(name) ?? this.parent?.lookup(name);
  }

  *names(): Iterable<string> {
    yield* this.symbols.keys();
    if (this.parent) yield* this.parent.names();
  }
}

/** Per-function facts used to decide which functions must be async. */
interface FunctionContext {
  node: AST.Program | AST.FunctionDeclaration | AST.FunctionExpression;
  awaits: boolean;
  calls: Set<AST.FunctionDeclaration>;
  loops: number;
  inFunction: boolean;
}

export interface CheckResult {
  /** Every name the program declares anywhere, so code generation can avoid collisions. */
  declared: Set<string>;
  usesWait: boolean;
  usesBeg: boolean;
  usesExit: boolean;
  builtins: Set<string>;
}

const describeLiteral = (expr: AST.Expression): string | undefined => {
  switch (expr.kind) {
    case 'Boolean':
    case 'Null':
      return `"${expr.raw}" is not a number.`;
    case 'String':
    case 'Template':
      return `${expr.raw} is not a number.`;
    case 'Array':
      return `A list is not a number.`;
    case 'Object':
      return `An object is not a number.`;
    case 'FunctionExpression':
      return `A fetch is not a number.`;
    default:
      return undefined;
  }
};

export function check(program: AST.Program): CheckResult {
  return new Checker().run(program);
}

class Checker {
  private readonly declared = new Set<string>();
  private readonly builtins = new Set<string>();
  private usesWait = false;
  private usesBeg = false;
  private usesExit = false;
  private readonly contexts: FunctionContext[] = [];
  private readonly calls: Array<{ call: AST.CallExpression; target: AST.FunctionDeclaration }> = [];
  /** Function bodies are checked after the code around them, so they can see later declarations. */
  private readonly deferred: Array<() => void> = [];
  private ctx!: FunctionContext;

  run(program: AST.Program): CheckResult {
    this.ctx = this.context(program, false);
    const scope = new Scope();
    this.block(program.body, scope);
    while (this.deferred.length) this.deferred.shift()!();
    this.inferAsync();
    return { declared: this.declared, usesWait: this.usesWait, usesBeg: this.usesBeg, usesExit: this.usesExit, builtins: this.builtins };
  }

  private context(node: FunctionContext['node'], inFunction: boolean): FunctionContext {
    const ctx: FunctionContext = { node, awaits: false, calls: new Set(), loops: 0, inFunction };
    this.contexts.push(ctx);
    return ctx;
  }

  /** A function is async if it waits or begs, or calls a named fetch that is async. */
  private inferAsync(): void {
    const asyncFns = new Set<AST.FunctionDeclaration>();
    let changed = true;
    while (changed) {
      changed = false;
      for (const ctx of this.contexts) {
        if (ctx.node.kind === 'FunctionDeclaration' && !asyncFns.has(ctx.node)) {
          if (ctx.awaits || [...ctx.calls].some((fn) => asyncFns.has(fn))) {
            asyncFns.add(ctx.node);
            changed = true;
          }
        }
      }
    }
    for (const ctx of this.contexts) {
      ctx.node.async = ctx.awaits || [...ctx.calls].some((fn) => asyncFns.has(fn));
    }
    for (const { call, target } of this.calls) call.awaited = asyncFns.has(target);
  }

  // ---------------------------------------------------------------- scopes

  private declare(scope: Scope, name: AST.Identifier, kind: SymbolKind, ready: boolean, fn?: AST.FunctionDeclaration): void {
    if ((BUILTINS as readonly string[]).includes(name.name)) {
      throw new BarkError(`\`${name.name}\` is one of ${DOG}'s built-in tricks.`, name.loc, 'pick another name');
    }
    const existing = scope.symbols.get(name.name);
    if (existing) {
      const what = existing.kind === 'function' ? 'a fetch' : existing.kind === 'parameter' ? 'a parameter' : 'a name';
      throw new BarkError(
        `\`${name.name}\` is already ${what} here, from line ${existing.loc.line}.`,
        name.loc,
        existing.kind === 'variable' ? `to change it, drop the \`sit\`: \`${name.name} = ...\`` : 'pick another name',
      );
    }
    scope.symbols.set(name.name, { name: name.name, kind, loc: name.loc, ready, fn });
    this.declared.add(name.name);
  }

  /** Hoist the block's declarations so use-before-declare can be reported precisely. */
  private block(statements: AST.Statement[], scope: Scope): void {
    for (const statement of statements) {
      if (statement.kind === 'FunctionDeclaration') this.declare(scope, statement.name, 'function', true, statement);
    }
    for (const statement of statements) {
      if (statement.kind === 'VariableDeclaration') {
        this.declare(scope, statement.name, statement.constant ? 'constant' : 'variable', false);
      }
    }
    for (const statement of statements) this.statement(statement, scope);
  }

  private resolve(id: AST.Identifier, scope: Scope): BarkSymbol | undefined {
    const symbol = scope.lookup(id.name);
    if (symbol) {
      if (!symbol.ready) {
        throw new BarkError(`${DOG} can't use \`${id.name}\` yet.\nIt doesn't sit down until line ${symbol.loc.line}.`, id.loc, `move \`sit ${id.name} = ...\` above this line`);
      }
      return symbol;
    }
    if ((BUILTINS as readonly string[]).includes(id.name)) {
      this.builtins.add(id.name);
      return undefined;
    }
    if (JS_GLOBALS.has(id.name)) return undefined;
    if (id.name in JS_LITERALS) {
      throw new BarkError(`${DOG} doesn't speak JavaScript.\nIn BarkScript, \`${id.name}\` is \`${JS_LITERALS[id.name]}\`.`, id.loc, `use \`${JS_LITERALS[id.name]}\``);
    }
    const suggestion = closest(id.name, scope.names());
    throw new BarkError(
      `${DOG} doesn't know \`${id.name}\`.`,
      id.loc,
      suggestion ? `did you mean \`${suggestion}\`?` : `declare it first with \`sit ${id.name} = ...\``,
    );
  }

  // ------------------------------------------------------------ statements

  private statement(s: AST.Statement, scope: Scope): void {
    switch (s.kind) {
      case 'VariableDeclaration':
        if (s.init) this.expression(s.init, scope);
        scope.symbols.get(s.name.name)!.ready = true;
        return;
      case 'Print':
        s.args.forEach((arg) => this.expression(arg, scope));
        return;
      case 'FunctionDeclaration':
        this.functionBody(s, s.params, s.body, scope);
        return;
      case 'CallStatement':
        this.expression(s.call, scope);
        return;
      case 'BegStatement':
        this.expression(s.beg, scope);
        return;
      case 'Return':
        if (!this.ctx.inFunction) {
          throw new BarkError(`${DOG} isn't holding anything.\n\`drop it\` only works inside a fetch.`, s.loc, 'use `drop it` to hand back a value from `fetch name() ... end`');
        }
        if (s.value) this.expression(s.value, scope);
        return;
      case 'If':
        for (const branch of s.branches) {
          this.expression(branch.test, scope);
          this.block(branch.body, new Scope(scope));
        }
        if (s.otherwise) this.block(s.otherwise, new Scope(scope));
        return;
      case 'Repeat': {
        this.expression(s.count, scope);
        const problem = describeLiteral(s.count);
        if (problem) throw new BarkError(problem, s.count.loc, '`again` needs a number of times, like `again 3`');
        this.loopBody(s.body, new Scope(scope));
        return;
      }
      case 'While':
        if (s.test) this.expression(s.test, scope);
        this.loopBody(s.body, new Scope(scope));
        return;
      case 'Each': {
        this.expression(s.iterable, scope);
        const inner = new Scope(scope);
        this.declare(inner, s.name, 'each', true);
        this.loopBody(s.body, inner);
        return;
      }
      case 'Range': {
        for (const part of [s.from, s.to, s.step]) {
          if (!part) continue;
          this.expression(part, scope);
          const problem = describeLiteral(part);
          if (problem) throw new BarkError(problem, part.loc, 'counting needs numbers, like `again i from 1 to 10`');
        }
        if (s.step?.kind === 'Number' && s.step.value === 0) {
          throw new BarkError(`Counting \`by 0\` never gets anywhere.\n${DOG} would chase his tail forever.`, s.step.loc, 'use a step like `by 1` or `by -1`');
        }
        const inner = new Scope(scope);
        this.declare(inner, s.name, 'range', true);
        this.loopBody(s.body, inner);
        return;
      }
      case 'Break':
        if (this.ctx.loops === 0) throw new BarkError(`Nothing to stop.\n\`no\` only works inside an \`again\` loop.`, s.loc, 'to leave a fetch early, use `drop it`');
        return;
      case 'Continue':
        if (this.ctx.loops === 0) throw new BarkError(`Nothing to skip.\n\`leave it\` only works inside an \`again\` loop.`, s.loc);
        return;
      case 'Wait': {
        this.expression(s.duration, scope);
        const problem = describeLiteral(s.duration);
        if (problem) throw new BarkError(problem, s.duration.loc, '`wait` takes milliseconds, or a number followed by `seconds`');
        this.usesWait = true;
        this.ctx.awaits = true;
        return;
      }
      case 'Exit':
        this.usesExit = true;
        return;
      case 'Assignment':
        this.assignment(s, scope);
        return;
    }
  }

  private loopBody(body: AST.Statement[], scope: Scope): void {
    this.ctx.loops++;
    this.block(body, scope);
    this.ctx.loops--;
  }

  private assignment(s: AST.AssignmentStatement, scope: Scope): void {
    this.expression(s.value, scope);
    if (s.target.kind !== 'Identifier') {
      this.expression(s.target, scope);
      return;
    }
    const id = s.target;
    const symbol = scope.lookup(id.name);
    if (!symbol) {
      if (JS_GLOBALS.has(id.name) || (BUILTINS as readonly string[]).includes(id.name)) {
        throw new BarkError(`\`${id.name}\` is built in, so ${DOG} won't change it.`, id.loc, `make your own with \`sit my${id.name[0].toUpperCase()}${id.name.slice(1)} = ...\``);
      }
      const suggestion = closest(id.name, scope.names());
      throw new BarkError(
        `${DOG} doesn't know \`${id.name}\`.`,
        id.loc,
        suggestion ? `did you mean \`${suggestion}\`? To make a new one, use \`sit ${id.name} = ...\`` : `declare it first with \`sit ${id.name} = ...\``,
      );
    }
    this.resolve(id, scope);
    switch (symbol.kind) {
      case 'constant':
        throw new BarkError(`\`${id.name}\` was told to STAY.\nIt can't be changed.`, id.loc, `declare it with \`sit\` on line ${symbol.loc.line} if it needs to change`);
      case 'function':
        throw new BarkError(`\`${id.name}\` is a fetch. ${DOG} won't overwrite it.`, id.loc, 'use a different name for the value');
      case 'each':
        throw new BarkError(`\`${id.name}\` is borrowed from the \`again each\` loop and can't be changed.`, id.loc, `copy it first: \`sit copy = ${id.name}\``);
      case 'range':
        throw new BarkError(`\`${id.name}\` is counted by the \`again\` loop and can't be changed.`, id.loc, 'use `by` to change the step, or `again while` for full control');
    }
    if (s.operator !== '=' && s.operator !== '+=') {
      const problem = describeLiteral(s.value);
      if (problem) throw new BarkError(problem, s.value.loc);
    }
  }

  private functionBody(
    node: AST.FunctionDeclaration | AST.FunctionExpression,
    params: AST.Identifier[],
    body: AST.Statement[],
    scope: Scope,
  ): void {
    const ctx = this.context(node, true);
    this.deferred.push(() => {
      const saved = this.ctx;
      this.ctx = ctx;
      const inner = new Scope(scope);
      for (const param of params) this.declare(inner, param, 'parameter', true);
      this.block(body, inner);
      this.ctx = saved;
    });
  }

  // ----------------------------------------------------------- expressions

  private expression(e: AST.Expression, scope: Scope): void {
    switch (e.kind) {
      case 'Number':
      case 'String':
      case 'Boolean':
      case 'Null':
        return;
      case 'Template':
        for (const part of e.parts) if (typeof part !== 'string') this.expression(part, scope);
        return;
      case 'Identifier':
        this.resolve(e, scope);
        return;
      case 'Binary': {
        this.expression(e.left, scope);
        this.expression(e.right, scope);
        if (e.operator === '==' || e.operator === '!=') return;
        const textOk = e.operator === '+';
        for (const side of [e.left, e.right]) {
          if (textOk && (side.kind === 'String' || side.kind === 'Template')) return;
        }
        for (const side of [e.left, e.right]) {
          const problem = describeLiteral(side);
          if (problem) throw new BarkError(problem, side.loc, e.operator === '+' ? 'to join text, put a string on one side' : undefined);
        }
        return;
      }
      case 'Logical':
        this.expression(e.left, scope);
        this.expression(e.right, scope);
        return;
      case 'Unary': {
        this.expression(e.argument, scope);
        if (e.operator === '-') {
          const problem = describeLiteral(e.argument);
          if (problem) throw new BarkError(problem, e.argument.loc);
        }
        return;
      }
      case 'Call':
        this.call(e, scope);
        return;
      case 'Member':
        this.expression(e.object, scope);
        return;
      case 'Index':
        this.expression(e.object, scope);
        this.expression(e.index, scope);
        return;
      case 'Array':
        e.elements.forEach((el) => this.expression(el, scope));
        return;
      case 'Object': {
        const seen = new Map<string, number>();
        for (const entry of e.entries) {
          if (seen.has(entry.key)) {
            throw new BarkError(`This object has \`${entry.key}\` twice.`, entry.loc, `the first one is on line ${seen.get(entry.key)}`);
          }
          seen.set(entry.key, entry.loc.line);
          this.expression(entry.value, scope);
        }
        return;
      }
      case 'FunctionExpression':
        this.functionBody(e, e.params, e.body, scope);
        return;
      case 'Beg':
        if (e.prompt) this.expression(e.prompt, scope);
        this.usesBeg = true;
        this.ctx.awaits = true;
        return;
    }
  }

  private call(e: AST.CallExpression, scope: Scope): void {
    this.expression(e.callee, scope);
    e.args.forEach((arg) => this.expression(arg, scope));
    if (e.callee.kind !== 'Identifier') return;
    const symbol = scope.lookup(e.callee.name);
    if (!symbol) return;
    if (symbol.kind === 'function' && symbol.fn) {
      const fn = symbol.fn;
      if (fn.params.length !== e.args.length) {
        const expected = fn.params.length === 0 ? 'nothing' : `${fn.params.length} ${fn.params.length === 1 ? 'thing' : 'things'} (${fn.params.map((p) => p.name).join(', ')})`;
        throw new BarkError(
          `\`${fn.name.name}\` expects ${expected}, but got ${e.args.length}.`,
          e.loc,
          `see \`fetch ${fn.name.name}(${fn.params.map((p) => p.name).join(', ')})\` on line ${fn.loc.line}`,
        );
      }
      this.ctx.calls.add(fn);
      this.calls.push({ call: e, target: fn });
    } else if (symbol.kind === 'constant' || symbol.kind === 'variable') {
      // Calling a value is fine (it may hold an unnamed fetch); nothing to check statically.
    }
  }
}
