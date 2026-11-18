import type * as AST from './ast.js';
import { BarkError, DOG, type SourceLocation } from './errors.js';
import { tokenize } from './lexer.js';
import type { Token } from './tokens.js';

/** What JavaScript habits look like at the start of a line, and the BarkScript word for each. */
const JS_HABITS: Record<string, string> = {
  let: 'sit',
  var: 'sit',
  const: 'stay',
  function: 'fetch',
  return: 'drop it',
  break: 'no',
  continue: 'leave it',
  else: 'otherwise',
  elif: 'otherwise if',
  for: 'again',
  while: 'again while',
  print: 'woof',
  console: 'woof',
  exit: 'play dead',
};

type BlockKind = 'fetch' | 'if' | 'again';

const ASSIGNMENT_OPS = new Set(['=', '+=', '-=', '*=', '/=']);

export function parse(source: string): AST.Program {
  return new Parser(tokenize(source)).program();
}

/** Parse a single expression, used for `{interpolations}` inside strings. */
export function parseExpression(source: string, line: number, column: number): AST.Expression {
  const parser = new Parser(tokenize(source, { line, column }));
  return parser.lonelyExpression();
}

const loc = (token: Token): SourceLocation => ({ line: token.line, column: token.column, length: Math.max(1, token.length) });

const describe = (token: Token): string => {
  if (token.type === 'eof') return 'the end of the file';
  if (token.type === 'newline') return 'the end of the line';
  return `\`${token.raw}\``;
};

class Parser {
  private pos = 0;
  /** Inside ( ), [ ] or { } newlines are insignificant. */
  private bracketDepth = 0;

  constructor(private readonly tokens: Token[]) {}

  // ------------------------------------------------------------------ cursor

  private peek(offset = 0): Token {
    if (this.bracketDepth > 0) this.skipNewlines();
    let index = this.pos;
    let seen = 0;
    while (index < this.tokens.length - 1) {
      if (this.bracketDepth > 0 && this.tokens[index].type === 'newline') {
        index++;
        continue;
      }
      if (seen === offset) break;
      seen++;
      index++;
    }
    return this.tokens[Math.min(index, this.tokens.length - 1)];
  }

  private next(): Token {
    if (this.bracketDepth > 0) this.skipNewlines();
    const token = this.tokens[this.pos];
    if (token.type !== 'eof') this.pos++;
    return token;
  }

  private skipNewlines(): void {
    while (this.tokens[this.pos].type === 'newline') this.pos++;
  }

  private is(value: string, type?: Token['type']): boolean {
    const token = this.peek();
    return token.value === value && (type ? token.type === type : token.type === 'keyword' || token.type === 'operator');
  }

  private isEndOfLine(): boolean {
    const t = this.peek();
    return t.type === 'newline' || t.type === 'eof';
  }

  private eat(value: string): Token | undefined {
    if (this.is(value)) return this.next();
    return undefined;
  }

  private expect(value: string, message: (got: Token) => string, hint?: string): Token {
    const token = this.peek();
    if (this.is(value)) return this.next();
    throw new BarkError(message(token), loc(token), hint);
  }

  private identifier(message: (got: Token) => string, hint?: string): AST.Identifier {
    const token = this.peek();
    if (token.type === 'identifier') {
      this.next();
      return { kind: 'Identifier', name: token.value, loc: loc(token) };
    }
    if (token.type === 'keyword') {
      throw new BarkError(`\`${token.value}\` is one of ${DOG}'s commands, so it can't be used as a name.`, loc(token), 'pick another name');
    }
    throw new BarkError(message(token), loc(token), hint);
  }

  private endOfStatement(): void {
    const token = this.peek();
    if (token.type === 'newline') {
      this.next();
      return;
    }
    // A block may close on the same line: `fetch (x) drop it x * 2 end`
    if (token.type === 'eof' || (token.type === 'keyword' && token.value === 'end')) return;
    throw new BarkError(`${DOG} got confused by ${describe(token)} here.\nEach statement goes on its own line.`, loc(token), 'move it onto a new line');
  }

  // -------------------------------------------------------------- statements

  program(): AST.Program {
    const body: AST.Statement[] = [];
    this.skipNewlines();
    while (this.peek().type !== 'eof') {
      const token = this.peek();
      if (this.is('end')) {
        throw new BarkError(`There's nothing here to \`end\`.`, loc(token), 'every `end` closes a `fetch`, `if` or `again` above it. Remove this one, or check for an extra `end`');
      }
      if (this.is('otherwise')) {
        throw new BarkError(`\`otherwise\` needs an \`if\` to belong to.`, loc(token), 'start with `if <condition>`, then `otherwise`');
      }
      body.push(this.statement());
      this.skipNewlines();
    }
    return { kind: 'Program', body };
  }

  /** Parse statements up to (and consuming) `end`. */
  private block(opener: Token, kind: BlockKind): AST.Statement[] {
    const body = this.statementsUntil(['end'], opener, kind);
    this.next(); // end
    return body;
  }

  private statementsUntil(stops: string[], opener: Token, kind: BlockKind): AST.Statement[] {
    const body: AST.Statement[] = [];
    this.skipNewlines();
    for (;;) {
      const token = this.peek();
      if (token.type === 'eof') {
        const what = kind === 'fetch' ? 'fetch' : kind === 'if' ? '`if`' : '`again` loop';
        const running = kind === 'fetch' ? `${DOG} is still running.` : kind === 'again' ? `${DOG} is going round forever.` : `${DOG} is still waiting.`;
        throw new BarkError(`This ${what} never ended.\n${running}`, loc(opener), `add \`end\` to close the ${kind} on line ${opener.line}`);
      }
      if (token.type === 'keyword' && stops.includes(token.value)) return body;
      if (this.is('otherwise')) {
        throw new BarkError(`\`otherwise\` only works inside an \`if\`.`, loc(token), `close the ${kind} on line ${opener.line} with \`end\` first`);
      }
      body.push(this.statement());
      this.skipNewlines();
    }
  }

  private statement(): AST.Statement {
    const token = this.peek();
    let statement: AST.Statement;
    if (token.type === 'keyword') {
      switch (token.value) {
        case 'sit':
        case 'stay':
          statement = this.declaration();
          break;
        case 'woof':
          statement = this.print();
          break;
        case 'fetch':
          statement = this.functionDeclaration();
          break;
        case 'come here':
          statement = this.callStatement();
          break;
        case 'drop it':
          statement = this.returnStatement();
          break;
        case 'if':
          statement = this.ifStatement();
          break;
        case 'again':
          statement = this.loop();
          break;
        case 'no':
          this.next();
          statement = { kind: 'Break', loc: loc(token) };
          break;
        case 'leave it':
          this.next();
          statement = { kind: 'Continue', loc: loc(token) };
          break;
        case 'play dead':
          this.next();
          statement = { kind: 'Exit', loc: loc(token) };
          break;
        case 'wait':
          statement = this.wait();
          break;
        case 'beg': {
          const beg = this.primary() as AST.BegExpression;
          statement = { kind: 'BegStatement', beg, loc: loc(token) };
          break;
        }
        default:
          statement = this.expressionStatement();
      }
    } else {
      statement = this.expressionStatement();
    }
    statement.loc = { ...statement.loc, endLine: this.tokens[this.pos - 1].line };
    this.endOfStatement();
    return statement;
  }

  private declaration(): AST.VariableDeclaration {
    const keyword = this.next();
    const constant = keyword.value === 'stay';
    const command = keyword.value.toUpperCase();
    const name = this.identifier(
      (got) => `You told ${DOG} to ${command}, but not what to call it.`,
      `give it a name, like \`${keyword.value} treats = 3\``,
    );
    if (this.isEndOfLine()) {
      if (constant) {
        throw new BarkError(`${DOG} can't STAY on nothing.\n\`${name.name}\` needs a value that never changes.`, { ...name.loc }, `try \`stay ${name.name} = ...\``);
      }
      return { kind: 'VariableDeclaration', constant, name, loc: loc(keyword) };
    }
    this.expect('=', (got) => `${DOG} expected \`=\` after \`${keyword.value} ${name.name}\`, but found ${describe(got)}.`, `try \`${keyword.value} ${name.name} = ...\``);
    const init = this.expression();
    return { kind: 'VariableDeclaration', constant, name, init, loc: loc(keyword) };
  }

  private print(): AST.PrintStatement {
    const keyword = this.next();
    const args: AST.Expression[] = [];
    if (!this.isEndOfLine()) {
      do {
        args.push(this.expression());
      } while (this.eat(','));
    }
    return { kind: 'Print', args, loc: loc(keyword) };
  }

  private params(): AST.Identifier[] {
    const params: AST.Identifier[] = [];
    this.bracketDepth++;
    if (!this.is(')')) {
      do {
        params.push(this.identifier((got) => `${DOG} expected the name of a parameter, but found ${describe(got)}.`, 'parameters are names separated by commas: `fetch add(a, b)`'));
      } while (this.eat(','));
    }
    this.bracketDepth--;
    this.expect(')', (got) => `${DOG} expected \`)\` to close the parameter list, but found ${describe(got)}.`);
    return params;
  }

  private functionDeclaration(): AST.FunctionDeclaration {
    const keyword = this.next();
    const target = this.peek();
    if (target.type !== 'identifier') {
      if (target.type === 'keyword') {
        throw new BarkError(`\`${target.value}\` is one of ${DOG}'s commands, so it can't be a fetch name.`, loc(target), 'pick another name');
      }
      throw new BarkError(`You told ${DOG} to FETCH,\nbut never told him what to fetch.`, loc(keyword), 'name the fetch, like `fetch giveTreat()`');
    }
    const name = this.identifier(() => '');
    if (!this.is('(')) {
      throw new BarkError(`\`fetch ${name.name}\` needs parentheses, even when it takes nothing.`, { ...name.loc }, `write \`fetch ${name.name}()\``);
    }
    this.next();
    const params = this.params();
    this.endOfStatement();
    const saved = this.bracketDepth;
    this.bracketDepth = 0;
    const body = this.block(keyword, 'fetch');
    this.bracketDepth = saved;
    return { kind: 'FunctionDeclaration', name, params, body, loc: loc(keyword) };
  }

  private callStatement(): AST.CallStatement {
    const keyword = this.next();
    if (this.isEndOfLine()) {
      throw new BarkError(`${DOG} came, but nobody said who to come to.`, loc(keyword), 'name the fetch to call: `come here giveTreat()`');
    }
    const expr = this.postfix();
    if (expr.kind !== 'Call') {
      const name = expr.kind === 'Identifier' ? expr.name : 'it';
      throw new BarkError(`${DOG} came here, but nothing happened.\n\`${name}\` was never called.`, expr.loc, expr.kind === 'Identifier' ? `add parentheses: \`come here ${name}()\`` : 'add parentheses to call it');
    }
    expr.comeHere = true;
    return { kind: 'CallStatement', call: expr, loc: loc(keyword) };
  }

  private returnStatement(): AST.ReturnStatement {
    const keyword = this.next();
    const value = this.isEndOfLine() || this.is('end') ? undefined : this.expression();
    return { kind: 'Return', value, loc: loc(keyword) };
  }

  private ifStatement(): AST.IfStatement {
    const keyword = this.next();
    const branches: AST.IfBranch[] = [];
    let otherwise: AST.Statement[] | undefined;
    let branchToken = keyword;
    for (;;) {
      if (this.isEndOfLine()) {
        throw new BarkError(`\`if\` what? ${DOG} needs a condition.`, loc(branchToken), 'try `if treats > 0`');
      }
      const test = this.expression();
      this.endOfStatement();
      const body = this.statementsUntil(['otherwise', 'end'], keyword, 'if');
      branches.push({ test, body, loc: loc(branchToken) });
      if (this.is('end')) {
        this.next();
        break;
      }
      const otherwiseToken = this.next();
      if (this.is('if', 'keyword')) {
        branchToken = this.next();
        continue;
      }
      this.endOfStatement();
      otherwise = this.statementsUntil(['end', 'otherwise'], keyword, 'if');
      if (this.is('otherwise')) {
        throw new BarkError(`This \`if\` already has an \`otherwise\` on line ${otherwiseToken.line}.`, loc(this.peek()), 'use `otherwise if <condition>` for extra branches, before the final `otherwise`');
      }
      this.next();
      break;
    }
    return { kind: 'If', branches, otherwise, loc: loc(keyword) };
  }

  private loop(): AST.Statement {
    const keyword = this.next();
    const head = this.peek();
    const loopBody = () => {
      this.endOfStatement();
      return this.block(keyword, 'again');
    };

    if (this.isEndOfLine()) {
      throw new BarkError(`\`again\` how many times?`, loc(keyword), 'try `again 3`, `again while <condition>`, `again each dog in dogs`, `again i from 1 to 10` or `again forever`');
    }

    if (head.type === 'identifier') {
      const after = this.peek(1);
      if (head.value === 'forever' && (after.type === 'newline' || after.type === 'eof')) {
        this.next();
        return { kind: 'While', body: loopBody(), loc: loc(keyword) };
      }
      if (head.value === 'while') {
        this.next();
        if (this.isEndOfLine()) throw new BarkError(`\`again while\` what? ${DOG} needs a condition.`, loc(head), 'try `again while treats > 0`');
        const test = this.expression();
        return { kind: 'While', test, body: loopBody(), loc: loc(keyword) };
      }
      if (head.value === 'each') {
        this.next();
        const name = this.identifier((got) => `${DOG} expected a name after \`again each\`, but found ${describe(got)}.`, 'try `again each dog in dogs`');
        const inToken = this.peek();
        if (!(inToken.type === 'identifier' && inToken.value === 'in')) {
          throw new BarkError(`${DOG} expected \`in\` after \`again each ${name.name}\`, but found ${describe(inToken)}.`, loc(inToken), `try \`again each ${name.name} in list\``);
        }
        this.next();
        const iterable = this.expression();
        return { kind: 'Each', name, iterable, body: loopBody(), loc: loc(keyword) };
      }
      if (after.type === 'identifier' && after.value === 'from') {
        const name = this.identifier(() => '');
        this.next(); // from
        const from = this.expression();
        const toToken = this.peek();
        if (!(toToken.type === 'identifier' && toToken.value === 'to')) {
          throw new BarkError(`${DOG} knows where to start counting but not where to stop.`, loc(toToken), `try \`again ${name.name} from 1 to 10\``);
        }
        this.next();
        const to = this.expression();
        let step: AST.Expression | undefined;
        const byToken = this.peek();
        if (byToken.type === 'identifier' && byToken.value === 'by') {
          this.next();
          step = this.expression();
        }
        return { kind: 'Range', name, from, to, step, body: loopBody(), loc: loc(keyword) };
      }
    }

    const count = this.expression();
    return { kind: 'Repeat', count, body: loopBody(), loc: loc(keyword) };
  }

  private wait(): AST.WaitStatement {
    const keyword = this.next();
    if (this.isEndOfLine()) {
      throw new BarkError(`\`wait\` how long?`, loc(keyword), 'try `wait 500` (milliseconds) or `wait 2 seconds`');
    }
    const duration = this.expression();
    let unit: 'ms' | 'seconds' = 'ms';
    const unitToken = this.peek();
    if (unitToken.type === 'identifier' && ['ms', 'second', 'seconds'].includes(unitToken.value)) {
      this.next();
      unit = unitToken.value === 'ms' ? 'ms' : 'seconds';
    }
    return { kind: 'Wait', duration, unit, loc: loc(keyword) };
  }

  private expressionStatement(): AST.Statement {
    const token = this.peek();
    if (token.type === 'identifier' && token.value in JS_HABITS) {
      const after = this.peek(1);
      const looksLikeJs = !(after.type === 'operator' && ['=', '+=', '-=', '*=', '/=', '.', '[', '('].includes(after.value)) || token.value === 'console';
      if (looksLikeJs) {
        const word = JS_HABITS[token.value];
        throw new BarkError(`${DOG} doesn't speak JavaScript.\nIn BarkScript, \`${token.value}\` is \`${word}\`.`, loc(token), `use \`${word}\``);
      }
    }
    if (token.type === 'identifier' && (token.value === 'true' || token.value === 'false') && this.peek(1).type !== 'operator') {
      throw new BarkError(`${DOG} doesn't speak JavaScript.`, loc(token), 'use `good boy` or `bad dog`');
    }

    const target = this.expression();
    const op = this.peek();
    if (op.type === 'operator' && ASSIGNMENT_OPS.has(op.value)) {
      if (target.kind !== 'Identifier' && target.kind !== 'Member' && target.kind !== 'Index') {
        throw new BarkError(`${DOG} can't put something into that.`, target.loc, 'you can assign to a name, `dog.name` or `list[0]`');
      }
      this.next();
      if (this.isEndOfLine()) {
        throw new BarkError(`${describe(op)} what? The line ends before the value.`, loc(op), `try \`${op.value === '=' ? `${this.sourceName(target)} = 1` : `${this.sourceName(target)} ${op.value} 1`}\``);
      }
      const value = this.expression();
      return { kind: 'Assignment', operator: op.value as AST.AssignmentStatement['operator'], target, value, loc: target.loc };
    }
    if (target.kind === 'Call') {
      const name = this.sourceName(target.callee);
      throw new BarkError(`${DOG} doesn't come unless you call him.`, target.loc, `start the line with \`come here\`: \`come here ${name}(...)\``);
    }
    if (target.kind === 'Beg') {
      return { kind: 'BegStatement', beg: target, loc: target.loc };
    }
    throw new BarkError(`This line doesn't do anything.\n${DOG} sniffed it and walked away.`, target.loc, 'did you mean to `woof` it, or to assign it with `=`?');
  }

  private sourceName(expr: AST.Expression): string {
    if (expr.kind === 'Identifier') return expr.name;
    if (expr.kind === 'Member') return `${this.sourceName(expr.object)}.${expr.property}`;
    if (expr.kind === 'Index') return `${this.sourceName(expr.object)}[...]`;
    return 'it';
  }

  // ------------------------------------------------------------- expressions

  lonelyExpression(): AST.Expression {
    this.bracketDepth = 1;
    const expr = this.expression();
    const token = this.peek();
    if (token.type !== 'eof') {
      throw new BarkError(`${DOG} got confused by ${describe(token)} inside the \`{ }\`.`, loc(token), 'string braces hold a single expression, like "{name}" or "{a + b}"');
    }
    return expr;
  }

  expression(): AST.Expression {
    return this.or();
  }

  private binaryLevel<T extends AST.Expression>(
    operators: string[],
    operand: () => AST.Expression,
    build: (op: string, left: AST.Expression, right: AST.Expression, at: SourceLocation) => T,
  ): AST.Expression {
    let left = operand();
    for (;;) {
      const token = this.peek();
      if (!((token.type === 'operator' || token.type === 'keyword') && operators.includes(token.value))) return left;
      this.next();
      if (this.isEndOfLine()) {
        throw new BarkError(`This line ends too early.\n${DOG} expected something after \`${token.value}\`.`, loc(token), 'finish the expression on the same line, or wrap it in ( ) to continue on the next');
      }
      const right = operand();
      left = build(token.value, left, right, left.loc);
    }
  }

  private or(): AST.Expression {
    return this.binaryLevel(['or'], () => this.and(), (op, left, right, at) => ({ kind: 'Logical', operator: 'or', left, right, loc: at }));
  }

  private and(): AST.Expression {
    return this.binaryLevel(['and'], () => this.not(), (op, left, right, at) => ({ kind: 'Logical', operator: 'and', left, right, loc: at }));
  }

  private not(): AST.Expression {
    const token = this.peek();
    if (this.is('not', 'keyword')) {
      this.next();
      const argument = this.not();
      return { kind: 'Unary', operator: 'not', argument, loc: loc(token) };
    }
    return this.equality();
  }

  private equality(): AST.Expression {
    return this.binaryLevel(['==', '!='], () => this.comparison(), (op, left, right, at) => ({ kind: 'Binary', operator: op as '==', left, right, loc: at }));
  }

  private comparison(): AST.Expression {
    return this.binaryLevel(['<', '>', '<=', '>='], () => this.additive(), (op, left, right, at) => ({ kind: 'Binary', operator: op as '<', left, right, loc: at }));
  }

  private additive(): AST.Expression {
    return this.binaryLevel(['+', '-'], () => this.multiplicative(), (op, left, right, at) => ({ kind: 'Binary', operator: op as '+', left, right, loc: at }));
  }

  private multiplicative(): AST.Expression {
    return this.binaryLevel(['*', '/', '%'], () => this.unary(), (op, left, right, at) => ({ kind: 'Binary', operator: op as '*', left, right, loc: at }));
  }

  private unary(): AST.Expression {
    const token = this.peek();
    if (this.is('-', 'operator')) {
      this.next();
      const argument = this.unary();
      return { kind: 'Unary', operator: '-', argument, loc: loc(token) };
    }
    return this.postfix();
  }

  private arguments(): AST.Expression[] {
    const args: AST.Expression[] = [];
    this.bracketDepth++;
    if (!this.is(')')) {
      do {
        if (this.is(')')) break; // trailing comma
        args.push(this.expression());
      } while (this.eat(','));
    }
    this.bracketDepth--;
    this.expect(')', (got) => `${DOG} expected \`)\` to finish the call, but found ${describe(got)}.`, 'separate arguments with commas');
    return args;
  }

  private postfix(): AST.Expression {
    let expr = this.primary();
    for (;;) {
      if (this.is('(', 'operator')) {
        this.next();
        const args = this.arguments();
        expr = { kind: 'Call', callee: expr, args, comeHere: false, loc: expr.loc };
      } else if (this.is('.', 'operator')) {
        this.next();
        const token = this.next();
        if (token.type !== 'identifier' && !(token.type === 'keyword' && !token.value.includes(' '))) {
          throw new BarkError(`${DOG} expected a name after the \`.\`, but found ${describe(token)}.`, loc(token), 'try `dog.name`');
        }
        expr = { kind: 'Member', object: expr, property: token.value, loc: expr.loc };
      } else if (this.is('[', 'operator')) {
        this.next();
        this.bracketDepth++;
        const index = this.expression();
        this.bracketDepth--;
        this.expect(']', (got) => `${DOG} expected \`]\`, but found ${describe(got)}.`);
        expr = { kind: 'Index', object: expr, index, loc: expr.loc };
      } else {
        return expr;
      }
    }
  }

  private startsExpression(token: Token): boolean {
    if (token.type === 'number' || token.type === 'string' || token.type === 'template' || token.type === 'identifier') return true;
    if (token.type === 'operator') return ['(', '[', '{', '-'].includes(token.value);
    if (token.type === 'keyword') return ['good boy', 'good girl', 'bad dog', 'empty bowl', 'not', 'fetch', 'come here', 'beg'].includes(token.value);
    return false;
  }

  private primary(): AST.Expression {
    const token = this.peek();
    switch (token.type) {
      case 'number':
        this.next();
        return { kind: 'Number', value: Number(token.value), raw: token.raw, loc: loc(token) };
      case 'string':
        this.next();
        return { kind: 'String', value: token.value, raw: token.raw, loc: loc(token) };
      case 'template': {
        this.next();
        const parts = token.parts!.map((part) => (part.kind === 'text' ? part.value : parseExpression(part.source, part.line, part.column)));
        return { kind: 'Template', parts, raw: token.raw, loc: loc(token) };
      }
      case 'identifier':
        this.next();
        return { kind: 'Identifier', name: token.value, loc: loc(token) };
      case 'keyword':
        return this.keywordExpression(token);
      case 'operator':
        if (token.value === '(') {
          this.next();
          this.bracketDepth++;
          const inner = this.expression();
          this.bracketDepth--;
          this.expect(')', (got) => `${DOG} expected \`)\`, but found ${describe(got)}.`, 'every `(` needs a matching `)`');
          return inner;
        }
        if (token.value === '[') return this.arrayLiteral();
        if (token.value === '{') return this.objectLiteral();
        break;
    }
    if (token.type === 'newline' || token.type === 'eof') {
      throw new BarkError(`The line ends before ${DOG} got a value.`, loc(token), 'finish the expression');
    }
    throw new BarkError(`${DOG} expected a value here, but found ${describe(token)}.`, loc(token));
  }

  private keywordExpression(token: Token): AST.Expression {
    switch (token.value) {
      case 'good boy':
      case 'good girl':
        this.next();
        return { kind: 'Boolean', value: true, raw: token.value, loc: loc(token) };
      case 'bad dog':
        this.next();
        return { kind: 'Boolean', value: false, raw: token.value, loc: loc(token) };
      case 'empty bowl':
        this.next();
        return { kind: 'Null', raw: token.value, loc: loc(token) };
      case 'come here': {
        this.next();
        const expr = this.postfix();
        if (expr.kind !== 'Call') {
          throw new BarkError(`${DOG} came here, but nothing was called.`, expr.loc, 'add parentheses to call it: `come here giveTreat()`');
        }
        expr.comeHere = true;
        return expr;
      }
      case 'beg': {
        this.next();
        const saved = this.bracketDepth;
        const prompt = this.startsExpression(this.peek()) ? this.expression() : undefined;
        this.bracketDepth = saved;
        return { kind: 'Beg', prompt, loc: loc(token) };
      }
      case 'fetch': {
        this.next();
        if (!this.is('(', 'operator')) {
          if (this.peek().type === 'identifier') {
            throw new BarkError(`A named fetch has to be on its own line.`, loc(this.peek()), 'inside an expression, write an unnamed one: `fetch (x) ... end`');
          }
          throw new BarkError(`You told ${DOG} to FETCH,\nbut never told him what to fetch.`, loc(token), 'an unnamed fetch looks like `fetch (x) ... end`');
        }
        this.next();
        const params = this.params();
        const saved = this.bracketDepth;
        this.bracketDepth = 0;
        const body = this.block(token, 'fetch');
        this.bracketDepth = saved;
        return { kind: 'FunctionExpression', params, body, loc: loc(token) };
      }
    }
    throw new BarkError(`\`${token.value}\` can't be used as a value.`, loc(token), `\`${token.value}\` is a command, so it goes at the start of a line`);
  }

  private arrayLiteral(): AST.ArrayLiteral {
    const open = this.next();
    this.bracketDepth++;
    const elements: AST.Expression[] = [];
    while (!this.is(']')) {
      elements.push(this.expression());
      if (!this.eat(',')) break;
    }
    this.bracketDepth--;
    this.expect(']', (got) => `${DOG} expected \`,\` or \`]\` in this list, but found ${describe(got)}.`, 'separate items with commas: `[1, 2, 3]`');
    return { kind: 'Array', elements, loc: loc(open) };
  }

  private objectLiteral(): AST.ObjectLiteral {
    const open = this.next();
    this.bracketDepth++;
    const entries: AST.ObjectEntry[] = [];
    while (!this.is('}')) {
      const keyToken = this.next();
      let key: string;
      if (keyToken.type === 'identifier' || keyToken.type === 'string' || keyToken.type === 'number') key = keyToken.value;
      else if (keyToken.type === 'keyword' && !keyToken.value.includes(' ')) key = keyToken.value;
      else throw new BarkError(`${DOG} expected a key here, but found ${describe(keyToken)}.`, loc(keyToken), 'objects look like `{ name: "Walter", age: 3 }`');
      this.expect(':', (got) => `${DOG} expected \`:\` after the key \`${key}\`, but found ${describe(got)}.`, `try \`${key}: value\``);
      const value = this.expression();
      entries.push({ key, loc: loc(keyToken), value });
      if (!this.eat(',')) break;
    }
    this.bracketDepth--;
    this.expect('}', (got) => `${DOG} expected \`,\` or \`}\` in this object, but found ${describe(got)}.`, 'separate entries with commas');
    return { kind: 'Object', entries, loc: loc(open) };
  }
}
