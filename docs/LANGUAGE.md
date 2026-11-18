# The BarkScript language

A tour of everything BarkScript can do, in the order you will want it. Every code block
on this page is compiled by the test suite, so if it is here, it works.

The formal rules live in [GRAMMAR.md](GRAMMAR.md).

## Contents

- [Printing](#printing)
- [Names: sit and stay](#names-sit-and-stay)
- [Values](#values)
- [Text](#text)
- [Operators](#operators)
- [Conditionals](#conditionals)
- [Loops](#loops)
- [Functions: fetch](#functions-fetch)
- [Lists and objects](#lists-and-objects)
- [Waiting and input](#waiting-and-input)
- [Stopping the program](#stopping-the-program)
- [Using JavaScript](#using-javascript)
- [Errors](#errors)
- [Cheat sheet](#cheat-sheet)

## Printing

`woof` prints. Give it several values and it separates them with spaces.

```bark
woof "Hello, world!"
woof "Treats:", 3
woof
```

`#` starts a comment.

```bark
# This line is for humans.
woof "This one is for Walter." # so is this, sort of
```

## Names: sit and stay

`sit` declares a name you can change later. `stay` declares one you can't.

```bark
sit treats = 3
stay name = "Walter"

treats = treats - 1
treats += 2
woof name, "has", treats, "treats"
```

`sit` without a value leaves the name empty until you fill it.

```bark
sit favourite
favourite = "the squeaky one"
woof favourite
```

Names are block scoped, like `let` in JavaScript. A name declared inside an `if`, a loop or a
`fetch` is gone at its `end`.

## Values

| Value | BarkScript |
|---|---|
| numbers | `3`, `0.5`, `1_000_000` |
| text | `"double"` or `'single'` quotes |
| true | `good boy` (or `good girl`) |
| false | `bad dog` |
| nothing | `empty bowl` |
| lists | `[1, 2, 3]` |
| objects | `{ name: "Walter", age: 3 }` |
| functions | `fetch (x) drop it x * 2 end` |

```bark
stay walter = { name: "Walter", age: 3, vaccinated: good boy, middleName: empty bowl }
woof walter
```

## Text

Double-quoted text fills in anything inside `{ }`. Single-quoted text is taken literally.

```bark
stay name = "Walter"
stay age = 3

woof "{name} is {age * 7} in dog years."
woof '{name} stays exactly as typed.'
woof "Use \{ and \} for a literal brace."
```

Escapes: `\n` new line, `\t` tab, `\"`, `\'`, `\\`, `\{`, `\}`.

## Operators

| Kind | Operators |
|---|---|
| maths | `+ - * / %` |
| comparison | `== != < > <= >=` (always strict) |
| logic | `and or not` |
| assignment | `= += -= *= /=` |

`+` joins text when either side is text.

```bark
sit wags = 2 + 3 * 4
woof wags, wags % 2 == 0, not (wags > 10 and wags < 20)
woof "Wags: " + wags
```

## Conditionals

```bark
sit treats = 2

if treats > 2
    woof "Spoiled."
otherwise if treats > 0
    woof "Content."
otherwise
    woof "Staring at you."
end
```

## Loops

Every loop starts with `again` and closes with `end`.

```bark
# a number of times
again 3
    woof "Woof!"
end

# counting, inclusive at both ends
again n from 1 to 5
    woof n
end

# counting down, or by steps
again n from 10 to 0 by -5
    woof n
end

# every item in a list
again each toy in ["ball", "rope", "sock"]
    woof "Fetched the {toy}."
end

# while something is true
sit energy = 3
again while energy > 0
    energy -= 1
end
```

`again forever` runs until something says `no`. `no` leaves the loop. `leave it` skips to the
next round.

```bark
sit n = 0
again forever
    n += 1
    if n == 2
        leave it
    end
    if n > 4
        no
    end
    woof n
end
```

A loop variable from `again each` or `again ... from` can't be reassigned inside the loop.

## Functions: fetch

`fetch` defines a function. `drop it` returns a value. To call a function as a statement,
start the line with `come here`.

```bark
fetch greet(name)
    woof "Who's a good boy? {name} is."
end

fetch dogYears(age)
    drop it age * 7
end

come here greet("Walter")
woof dogYears(3)
```

Inside an expression, `come here` is optional, so both of these work:

```bark
fetch double(x)
    drop it x * 2
end

sit a = double(4)
sit b = come here double(4)
woof a == b
```

A `fetch` can be called before the line that defines it, and it can call itself.

```bark
woof factorial(5)

fetch factorial(n)
    if n <= 1
        drop it 1
    end
    drop it n * factorial(n - 1)
end
```

Unnamed fetches are values. They are handy with list methods, and short ones fit on one line.

```bark
stay numbers = [1, 2, 3, 4]
stay doubled = numbers.map(fetch (n) drop it n * 2 end)
stay evens = numbers.filter(fetch (n)
    drop it n % 2 == 0
end)
woof doubled, evens
```

They close over the names around them:

```bark
fetch counter()
    sit count = 0
    drop it fetch ()
        count += 1
        drop it count
    end
end

stay next = counter()
come here next()
woof next()
```

## Lists and objects

Lists and objects are JavaScript arrays and objects, so their methods all work. Inside
brackets and braces, line breaks are fine.

```bark
sit pack = [
    { name: "Walter", age: 3 },
    { name: "Biscuit", age: 7 },
]

come here pack.push({ name: "Pickles", age: 1 })
pack[0].age += 1

woof pack.length, pack[0].age
woof pack.map(fetch (dog) drop it dog.name end).join(", ")
```

## Waiting and input

`wait` pauses. It takes milliseconds, or a number followed by `second` or `seconds`.

```bark
woof "Sit..."
wait 500
woof "Stay..."
wait 1 second
woof "Good."
```

`beg` asks for a line of input and gives it back as text. Use `number(...)` to turn it into a
number. When input runs out, `beg` gives back `""`.

```bark
sit name = beg "What's your name? "
sit age = number(beg "How old are you? ")
woof "{name}, that's {age * 7} in dog years."
```

A `fetch` that waits or begs becomes an `async function` in the JavaScript output, and every
call to it is awaited for you, including calls through other fetches. Unnamed fetches that
wait become async too, but nothing awaits them for you when you pass them to JavaScript
methods such as `map`.

## Stopping the program

`play dead` ends the program right there.

```bark
woof "Bang!"
play dead
woof "This never prints."
```

## Using JavaScript

BarkScript compiles to JavaScript and can use its globals directly: `Math`, `JSON`, `Date`,
`Number`, `String`, `Array`, `Object`, `Map`, `Set`, `Promise`, `parseInt`, `parseFloat`,
`isNaN` and friends.

```bark
woof Math.max(3, 9), JSON.stringify({ dog: "Walter" }), isNaN(number("bone"))
```

`new` constructs JavaScript objects, as you would expect.

```bark
stay seen = new Set(["Walter", "Biscuit", "Walter"])
stay today = new Date()
woof seen.size, today.getFullYear() > 2000
```

Two functions are built in:

| Function | Does |
|---|---|
| `random(min, max)` | a whole number from `min` to `max`, inclusive |
| `number(value)` | text to a number; `NaN` for blank or non-numeric text |

```bark
stay roll = random(1, 6)
woof "Walter rolled a {roll}."
```

## Errors

The compiler checks the whole program before anything runs, and tells you what went wrong,
where, and usually how to fix it.

```text
dog.bark:12

  11 | sit treats = 3
  12 | fetch
     | ^^^^^

You told Walter to FETCH,
but never told him what to fetch.

hint: name the fetch, like `fetch giveTreat()`
```

Things it catches before your program runs:

- names that were never declared, with a suggestion when you made a typo
- names used before their `sit`
- changing a `stay`, a loop variable or a fetch
- `"good boy" * 2` and other literals that are not numbers
- calling a `fetch` with the wrong number of arguments
- `drop it` outside a fetch, `no` and `leave it` outside a loop
- blocks that never `end`, and `end`s with nothing to close
- JavaScript habits: `return`, `let`, `function`, `true`, `&&`, `===`, semicolons

Runtime errors point back at the `.bark` line that failed:

```text
oops.bark:2

  1 | sit dog = empty bowl
  2 | woof dog.name

Walter tripped over something while running this.

TypeError: Cannot read properties of null (reading 'name')
```

## Cheat sheet

| BarkScript | JavaScript |
|---|---|
| `woof x` | `console.log(x)` |
| `sit x = 1` | `let x = 1;` |
| `stay x = 1` | `const x = 1;` |
| `fetch f(a) ... end` | `function f(a) { ... }` |
| `fetch (a) drop it a end` | `(a) => a` |
| `come here f(1)` | `f(1);` |
| `drop it x` | `return x;` |
| `if a ... otherwise if b ... otherwise ... end` | `if (a) {} else if (b) {} else {}` |
| `again 3 ... end` | `for (let i = 0; i < 3; i++) {}` |
| `again i from 1 to 10 ... end` | `for (let i = 1; i <= 10; i++) {}` |
| `again each x in xs ... end` | `for (const x of xs) {}` |
| `again while c ... end` | `while (c) {}` |
| `again forever ... end` | `while (true) {}` |
| `no` | `break;` |
| `leave it` | `continue;` |
| `wait 500` | `await sleep(500);` |
| `beg "?"` | `await ask("?")` |
| `play dead` | `process.exit(0);` |
| `good boy` / `bad dog` / `empty bowl` | `true` / `false` / `null` |
| `a and b`, `a or b`, `not a` | `a && b`, `a \|\| b`, `!a` |
| `a == b`, `a != b` | `a === b`, `a !== b` |
| `new Date()` | `new Date()` |
| `"Hi {name}"` | `` `Hi ${name}` `` |
