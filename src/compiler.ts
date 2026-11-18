import type * as AST from './ast.js';
import { check, type CheckResult } from './checker.js';
import { generate, type CodegenMode, type CodegenResult } from './codegen.js';
import { BarkError } from './errors.js';
import { parse } from './parser.js';

export interface CompileOptions {
  /** Shown in the generated header comment and in error messages. */
  filename?: string;
  /** `script` (default) produces a standalone Node.js program; `hosted` is for runners. */
  mode?: CodegenMode;
}

export interface CompileResult extends CodegenResult {
  program: AST.Program;
  facts: CheckResult;
}

/** Compile BarkScript source to JavaScript. Throws `BarkError` with a source location on failure. */
export function compile(source: string, options: CompileOptions = {}): CompileResult {
  const program = parse(source);
  const facts = check(program);
  const output = generate(program, facts, { mode: options.mode ?? 'script', filename: options.filename });
  return { ...output, program, facts };
}

/** Returns the first compile error, or undefined when the program is fine. */
export function diagnose(source: string): BarkError | undefined {
  try {
    check(parse(source));
    return undefined;
  } catch (error) {
    if (error instanceof BarkError) return error;
    throw error;
  }
}
