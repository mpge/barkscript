import type { SourceLocation } from './errors.js';

interface Base {
  loc: SourceLocation;
}

// ---------------------------------------------------------------- expressions

export interface NumberLiteral extends Base {
  kind: 'Number';
  value: number;
  raw: string;
}
export interface StringLiteral extends Base {
  kind: 'String';
  value: string;
  raw: string;
}
export interface TemplateLiteral extends Base {
  kind: 'Template';
  parts: Array<string | Expression>;
  raw: string;
}
export interface BooleanLiteral extends Base {
  kind: 'Boolean';
  value: boolean;
  raw: string;
}
export interface NullLiteral extends Base {
  kind: 'Null';
  raw: string;
}
export interface Identifier extends Base {
  kind: 'Identifier';
  name: string;
}
export interface BinaryExpression extends Base {
  kind: 'Binary';
  operator: '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '>' | '<=' | '>=';
  left: Expression;
  right: Expression;
}
export interface LogicalExpression extends Base {
  kind: 'Logical';
  operator: 'and' | 'or';
  left: Expression;
  right: Expression;
}
export interface UnaryExpression extends Base {
  kind: 'Unary';
  operator: '-' | 'not';
  argument: Expression;
}
export interface CallExpression extends Base {
  kind: 'Call';
  callee: Expression;
  args: Expression[];
  /** Written with `come here`. */
  comeHere: boolean;
  /** Set by the checker when the callee is an async `fetch`. */
  awaited?: boolean;
}
export interface MemberExpression extends Base {
  kind: 'Member';
  object: Expression;
  property: string;
}
export interface IndexExpression extends Base {
  kind: 'Index';
  object: Expression;
  index: Expression;
}
export interface ArrayLiteral extends Base {
  kind: 'Array';
  elements: Expression[];
}
export interface ObjectEntry {
  key: string;
  loc: SourceLocation;
  value: Expression;
}
export interface ObjectLiteral extends Base {
  kind: 'Object';
  entries: ObjectEntry[];
}
export interface FunctionExpression extends Base {
  kind: 'FunctionExpression';
  params: Identifier[];
  body: Statement[];
  async?: boolean;
}
export interface BegExpression extends Base {
  kind: 'Beg';
  prompt?: Expression;
}

export type Expression =
  | NumberLiteral
  | StringLiteral
  | TemplateLiteral
  | BooleanLiteral
  | NullLiteral
  | Identifier
  | BinaryExpression
  | LogicalExpression
  | UnaryExpression
  | CallExpression
  | MemberExpression
  | IndexExpression
  | ArrayLiteral
  | ObjectLiteral
  | FunctionExpression
  | BegExpression;

// ----------------------------------------------------------------- statements

export interface VariableDeclaration extends Base {
  kind: 'VariableDeclaration';
  constant: boolean;
  name: Identifier;
  init?: Expression;
}
export interface PrintStatement extends Base {
  kind: 'Print';
  args: Expression[];
}
export interface FunctionDeclaration extends Base {
  kind: 'FunctionDeclaration';
  name: Identifier;
  params: Identifier[];
  body: Statement[];
  async?: boolean;
}
export interface CallStatement extends Base {
  kind: 'CallStatement';
  call: CallExpression;
}
export interface BegStatement extends Base {
  kind: 'BegStatement';
  beg: BegExpression;
}
export interface ReturnStatement extends Base {
  kind: 'Return';
  value?: Expression;
}
export interface IfBranch {
  test: Expression;
  body: Statement[];
  loc: SourceLocation;
}
export interface IfStatement extends Base {
  kind: 'If';
  branches: IfBranch[];
  otherwise?: Statement[];
}
export interface RepeatLoop extends Base {
  kind: 'Repeat';
  count: Expression;
  body: Statement[];
}
export interface WhileLoop extends Base {
  kind: 'While';
  /** Absent for `again forever`. */
  test?: Expression;
  body: Statement[];
}
export interface EachLoop extends Base {
  kind: 'Each';
  name: Identifier;
  iterable: Expression;
  body: Statement[];
}
export interface RangeLoop extends Base {
  kind: 'Range';
  name: Identifier;
  from: Expression;
  to: Expression;
  step?: Expression;
  body: Statement[];
}
export interface BreakStatement extends Base {
  kind: 'Break';
}
export interface ContinueStatement extends Base {
  kind: 'Continue';
}
export interface WaitStatement extends Base {
  kind: 'Wait';
  duration: Expression;
  unit: 'ms' | 'seconds';
}
export interface ExitStatement extends Base {
  kind: 'Exit';
}
export interface AssignmentStatement extends Base {
  kind: 'Assignment';
  operator: '=' | '+=' | '-=' | '*=' | '/=';
  target: Identifier | MemberExpression | IndexExpression;
  value: Expression;
}

export type Statement =
  | VariableDeclaration
  | PrintStatement
  | FunctionDeclaration
  | CallStatement
  | BegStatement
  | ReturnStatement
  | IfStatement
  | RepeatLoop
  | WhileLoop
  | EachLoop
  | RangeLoop
  | BreakStatement
  | ContinueStatement
  | WaitStatement
  | ExitStatement
  | AssignmentStatement;

export interface Program {
  kind: 'Program';
  body: Statement[];
  /** Set by the checker when top-level code awaits. */
  async?: boolean;
}

export type Node = Program | Statement | Expression;
