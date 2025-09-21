## Query Syntax Principles

An input search query is parsed into `field:value` pairs. Special tokens include `"`, `:`, `(`, `)`, `AND`, `OR`, `-` (NOT), and `~` (fuzzy operator). Values without a specified field are assigned to the default field. Single characters like `:`, `-`, and `~` are treated as literals unless specified otherwise. For comparisons, strings are normalized by trimming leading and trailing whitespace and converting to lowercase, except when using regular expressions (`/.../flags`), where flags are preserved.

### Rule 1: Token Separation

The raw query string is split by quotes, whitespace, and certain punctuation characters (`(`, `)`, `:`, `-`, `~`). Quotes (`"`) take precedence over whitespace, so anything inside balanced quotes is preserved as a single unit. An opening quote without a matching closing quote is treated as a literal character. Escaped quotes (`\"`) are parsed as literal quotes.

**Example:**

The query:

```
abc "def"g" "hi jk"
```

is parsed as:

```json
[
  { "field": "default", "value": "abc" },
  { "field": "default", "value": "def" },
  { "field": "default", "value": "g" },
  { "field": "default", "value": " " },
  { "field": "default", "value": "hi" },
  { "field": "default", "value": "jk\"" }
]
```

### Rule 2: Field-Value Parsing

A field name is whatever appears before the first `:`. (If the colon appears at the start of the term, or there is no real token before it, the colon is treated literally rather than as a field separator.) The value begins immediately after that colon and runs until the next whitespace. If the value starts with a quote right after the colon, it ends at the matching closing quote (or, if missing, at the next whitespace).

**Examples:**

- Query:

  ```
  key::val1-:~) abc
  ```

  is parsed as:

  ```json
  [
    { "field": "key", "value": ":val1-:~)" },
    { "field": "default", "value": "abc" }
  ]
  ```
- Query:

  ```
  key:"abc def"
  ```

  is parsed as:

  ```json
  [
    { "field": "key", "value": "abc def" }
  ]
  ```
- Query with missing closing quote:

  ```
  key:"abc \"def
  ```

  is parsed as:

  ```json
  [
    { "field": "key", "value": "\"abc" },
    { "field": "default", "value": "\"def" }
  ]
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

A regex ending with a tilde (`~`), for example `/.../~`, is interpreted as a non-match and yields no results, without affecting the rest of the query.

### Rule 6: Field Presence and Value Queries

- For most frontmatter fields (for example `status` or `meta`):
  - `field:` matches notes where the field exists, regardless of whether the value is empty.
  - `field:""` matches notes where the field exists and is empty (after trimming whitespace).
  - `field:any` matches notes where the field exists and contains a non-empty value.
- `tag:#foo` is normalized to `tag:foo` (hash stripped for compatibility with Obsidian) and matches tags exactly.
- `tags:foo` performs a partial match across tag values (case-insensitive substring). Use this when you want to match nested tags without writing regex.
- `field:( ... )` scopes the nested query to that field. For example, `tag:(foo OR bar)` matches notes whose tags include either `foo` or `bar`.
- Virtual fields (see the list below) treat `field:` the same as `field:any`, ignore `field:""`, and honour `field:any`.
- `bookmarked:` and `bookmarked:any` return bookmarked notes; `bookmarked:""` and `bookmarked:false` yield no matches. `bookmarked:true` is supported for explicit checks.

**Hint:** Whitespace-only field values are trimmed and treated as undefined.

### Rule 7: Virtual Fields

The fields listed below are always present in every note (though their values may be empty).

- `title`
- `file`
- `path`
- `created`
- `modified`
- `tag`
- `tags`
- `content`
- `bookmarked`
- `aliases`
- `anyname`
- `locations`
- `full`

For these virtual fields, `field:` behaves like `field:any`, and `field:""` yields no results.

### Rule 8: Special Handling of `Bookmarked` Field

Every note includes a `bookmarked` field, set to either `true` or `false`.

- `bookmarked:` → same as `bookmarked:true`
- `bookmarked:any` → same as `bookmarked:true`
- `bookmarked:""` → never matches
- `bookmarked:false` → never matches (treated as if absent)

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
