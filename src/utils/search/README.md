## Query Syntax Principles

An input search query is parsed into `field:value` pairs. Special tokens include `"`, `:`, `(`, `)`, `AND`, `OR`, `-` (NOT), and `~` (fuzzy operator). Values without a specified field are assigned to the default field. Single characters like `:`, `-`, and `~` are treated as literals unless specified otherwise.

### Rule 1: Token Separation

The raw query string is split by quotes and whitespace. Quotes (`"`) take precedence over whitespace (` `). An opening quote without a matching closing quote is treated as a literal character. Escaped quotes (`\"`) are parsed as literal quotes.

**Example:**

The query:

```
abc "def"g" "hi jk"
```

is parsed as:

```
default: abc
AND
default: def
AND
default: g
AND
default: ' ' (whitespace)
AND
default: hi
AND
default: jk\"
```

### Rule 2: Field-Value Parsing

A field starts after whitespace and ends at the first `:` character. The value includes everything after that `:` up to the next whitespace. If the value starts with a quote (`"`) immediately after the colon, it ends at the next quote or, if no closing quote exists, at the next whitespace.

**Examples:**

- Query:

  ```
  key::val1-:~) abc
  ```

  is parsed as:

  ```
  key: :val1-:~)
  AND
  default: abc
  ```

- Query:

  ```
  key:"abc def"
  ```

  is parsed as:

  ```
  key: abc def
  ```

- Query with missing closing quote:

  ```
  key:"abc def
  ```

  is parsed as:

  ```
  key: \"abc
  AND
  default: def
  ```

### Rule 3: Tilde (`~`) as Fuzzy Operator

The tilde (`~`) is treated as a suffix fuzzy operator only in these cases:

- `abc~`
- `key:abc~`
- `"abc def"~`
- `key:"abc def"~`

**All other uses of `~` are treated as literal characters.**

**Examples:**

- `~`
- `key:~`
- `~key:abc`
- `regex~`

### Rule 4: Hyphen (`-`) as Unary Operator

A hyphen (`-`) is treated as a unary NOT operator only when it starts a string longer than one character.

**Examples:**

- `-abc`
- `-key:`
- `-key:abc`
- `-"abc def"`
- `-(...)`
- `-regex`

**In all other cases, hyphen is treated as a literal character.**

**Examples:**

- `-`
- `01-`
- `key:-abc`

### Rule 5: Regular Expressions

Regular expressions are supported when enclosed in slashes. Optional flags are allowed.

- `/.../`
- `key:/.../`
- `/.../i`
- `key:/.../i`

#### Fuzzy Search and Regular Expressions

A regex ending with a tilde (`~`), for example `/.../~`, is invalid and yields no results.

### Rule 6: Field Existence Queries

- `key:` matches all notes with a non-empty field named `key`.
- `key:""` matches all notes with an empty field named `key`.
- `key:exists` or `key:has` matches all notes containing the field `key`, regardless of whether it is empty or not.

**Hint:** Trailing and leading whitespace in field values is trimmed during comparison.
Therefore, a field containing only a single whitespace will be treated as empty/undefined.

### Rule 7: Virtual Fields

Some fields are always present in every note (though they may be empty). These include:

```
title
path
created
modified
tags
content
bookmarked
aliases
locations
```

Therefore searches like these

- `aliases:`
- `content:`

### Rule 8: Special Handling of Bookmarked Field

Every note has a `bookmarked` field that is always set to either `true` or `false`.

- The query `bookmarked:` is interpreted as `bookmarked:true`.
- The query `bookmarked:""` is interpreted as `bookmarked:false`.
- The query `bookmarked:exists`or `bookmarked:has` is interpreted as `bookmarked:true`.

### Validation

In these cases, the query is considered invalid and will not be passed to the parser:

- **UNBALANCED_PARENS** — Occurs when opening and closing parentheses `(` and `)` are not balanced.

  **Examples (invalid):**

  ```
  (abc OR def  
  abc) AND (def  
  (abc AND (def  
  ```
  
- **DANGLING_OPERATOR** — Occurs when a binary logical operator such as `AND` or `OR` appears without a valid term on one side.

  **Examples (invalid):**

  ```
  AND abc      
  abc OR       
  abc AND OR def        
  ```

- **UNFINISHED_REGEX** — Occurs when a regular expression starts with `/` but has no closing `/` (with optional flags).

  **Examples (invalid):**

  ```
  /abc         
  key:/tag(.*  
  /"unterminated  
  ```
