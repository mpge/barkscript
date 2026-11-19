# BarkScript grammar

This is the normative grammar for BarkScript 0.1. The lexer, parser, playground, TextMate
grammar and every example in this repository follow it. If the compiler and this file disagree,
the compiler has a bug.

## Source files

- Extension: `.bark`, encoding UTF-8.
- One statement per line. Newlines end statements.
- Blocks open with a keyword (`fetch`, `if`, `again`) and close with `end`.
- Indentation is not significant. Use it anyway; Rover appreciates it.
- `#` starts a comment that runs to the end of the line.
- Inside `( )`, `[ ]` and `{ }`, newlines are ignored, so long lists and calls can wrap.
- `end` may share a line with the statement before it, so a short unnamed fetch fits on one
  line: `fetch (x) drop it x * 2 end`.

## Keywords

Phrase keywords are two words separated by whitespace on the same line.

| BarkScript | Meaning | JavaScript |
|---|---|---|
| `sit` | declare a variable | `let` |
| `stay` | declare a constant | `const` |
| `woof` | print | `console.log(...)` |
| `fetch` | function | `function` |
| `come here` | call a function (statement form) | `f()` |
| `drop it` | return | `return` |
| `if` / `otherwise` / `otherwise if` | conditionals | `if` / `else` / `else if` |
| `again` | loop | `for` / `while` |
| `no` | break | `break` |
| `leave it` | skip to the next round | `continue` |
| `wait` | delay | `await sleep(ms)` |
| `beg` | read a line of input | `await ask(...)` |
| `play dead` | exit the program | `process.exit(0)` |
| `end` | close a block | `}` |
| `good boy`, `good girl` | true | `true` |
| `bad dog` | false | `false` |
| `empty bowl` | nothing | `null` |
| `and`, `or`, `not` | logic | `&&`, `\|\|`, `!` |
| `new` | construct a JavaScript object | `new` |

Contextual words have meaning only in one position and are ordinary names everywhere else:
`while`, `forever`, `each`, `in`, `from`, `to`, `by` (after `again`) and `second`, `seconds`,
`ms` (after `wait`).

Reserved words that cannot be used as names: `sit stay woof fetch come drop if otherwise again
no leave wait beg play end good bad empty and or not new`. Names may not start with `__`.
Names that JavaScript reserves (`class`, `new`, `this`, ...) are allowed and get a trailing
underscore in the output.

Built-in functions: `random(min, max)` returns a whole number between `min` and `max`
inclusive. `number(value)` converts text to a number. Both names are reserved.

Built-in value: `treats`, with exactly three methods, `bury(name, value)`, `grab(name)` and
`eat(name)`, checked at compile time. A program may declare its own `treats`, which hides the
built-in in that scope. JavaScript
globals such as `Math`, `JSON`, `Date`, `String` and `Array` are available as-is.

## Lexical grammar

```ebnf
newline     = "\n" | "\r\n" ;
comment     = "#" , { any char except newline } ;
identifier  = letter , { letter | digit | "_" } ;       (* letter includes "_" *)
number      = digit , { digit | "_" } , [ "." , digit , { digit | "_" } ] ;
string      = '"' , { char | escape | interpolation } , '"'
            | "'" , { char | escape } , "'" ;
escape      = "\" , ( "n" | "t" | "r" | "\" | '"' | "'" | "{" | "}" | "0" ) ;
interpolation = "{" , expression , "}" ;                (* double-quoted strings only *)
```

Operators and punctuation:

```
+  -  *  /  %  =  +=  -=  *=  /=  ==  !=  <  >  <=  >=  (  )  [  ]  {  }  ,  .  :
```

## Syntactic grammar

```ebnf
program     = { statement } ;
block       = { statement } , "end" ;

statement   = declaration
            | print
            | function
            | call
            | return
            | if
            | loop
            | "no"
            | "leave it"
            | wait
            | "play dead"
            | assignment ;

declaration = "sit" , identifier , [ "=" , expression ]
            | "stay" , identifier , "=" , expression ;
print       = "woof" , [ expression , { "," , expression } ] ;
function    = "fetch" , identifier , "(" , [ params ] , ")" , newline , block ;
params      = identifier , { "," , identifier } ;
call        = "come here" , postfix ;                   (* postfix must end in a call *)
return      = "drop it" , [ expression ] ;
if          = "if" , expression , { statement } ,
              { "otherwise if" , expression , { statement } } ,
              [ "otherwise" , { statement } ] , "end" ;
loop        = "again" , ( expression                      (* repeat N times *)
                        | "forever"
                        | "while" , expression
                        | "each" , identifier , "in" , expression
                        | identifier , "from" , expression , "to" , expression ,
                          [ "by" , expression ] ) ,
              block ;
wait        = "wait" , expression , [ "ms" | "second" | "seconds" ] ;
assignment  = target , ( "=" | "+=" | "-=" | "*=" | "/=" ) , expression ;
target      = identifier | postfix , ( "." , identifier | "[" , expression , "]" ) ;

expression  = or ;
or          = and , { "or" , and } ;
and         = not , { "and" , not } ;
not         = "not" , not | equality ;
equality    = comparison , { ( "==" | "!=" ) , comparison } ;
comparison  = additive , { ( "<" | ">" | "<=" | ">=" ) , additive } ;
additive    = multiplicative , { ( "+" | "-" ) , multiplicative } ;
multiplicative = unary , { ( "*" | "/" | "%" ) , unary } ;
unary       = "-" , unary | postfix ;
postfix     = primary , { "(" , [ arguments ] , ")" | "." , identifier | "[" , expression , "]" } ;
arguments   = expression , { "," , expression } ;
primary     = number | string | identifier
            | "good boy" | "good girl" | "bad dog" | "empty bowl"
            | "(" , expression , ")"
            | "[" , [ expression , { "," , expression } , [ "," ] ] , "]"
            | "{" , [ entry , { "," , entry } , [ "," ] ] , "}"
            | "come here" , postfix
            | "beg" , [ expression ]
            | "new" , primary , { "." , identifier } , "(" , [ arguments ] , ")"
            | "fetch" , "(" , [ params ] , ")" , block ;  (* anonymous function *)
entry       = ( identifier | string ) , ":" , expression ;
```

## Semantics

- `sit` and `stay` are block scoped. Every `fetch`, `if` branch and `again` body is a block.
- `fetch` declarations are hoisted within their block, so a function can be called above the
  line that defines it.
- A name must be declared before it is read or assigned. A `stay` cannot be reassigned.
- `==` and `!=` compare strictly (`===`, `!==`).
- `+` joins text when either side is text, as in JavaScript.
- `again N` evaluates `N` once and runs the body that many times.
- `again i from A to B` counts inclusively. It counts down when `A` and `B` are number literals
  with `A > B`, or when `by` is negative.
- A statement-level call must start with `come here`. Inside an expression, `come here` is
  optional: `sit n = fib(10)` and `sit n = come here fib(10)` mean the same thing.
- `wait` and `beg` pause the program. A `fetch` that uses them, directly or by calling another
  `fetch` that does, compiles to an `async function`, and calls to it are awaited.
- `wait 500` waits 500 milliseconds. `wait 2 seconds` waits two seconds.
- `beg "prompt"` prints the prompt and returns the next line of input as text, or `""` when
  input has ended. Use `number(...)` to turn it into a number.
- Strings in double quotes interpolate: `"Hello {name}"`. Single-quoted strings do not.
