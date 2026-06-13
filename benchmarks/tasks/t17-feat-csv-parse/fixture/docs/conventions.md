# Conventions

Conventions every contribution to csvkit-cli follows.

## CSV field format

A CSV line is a list of fields separated by commas. Fields follow RFC-4180-style
quoting, and parsing is **not** `line.split(',')`:

1. **Quoted fields.** A field may be wrapped in double quotes. Inside quotes a
   comma is a literal character, not a separator: `"a,b",c` is TWO fields
   (`a,b` and `c`), not three. The surrounding quotes are removed from the
   returned field.
2. **Escaped quotes.** Inside a quoted field, a doubled quote `""` denotes a
   literal `"`: `"she said ""hi"""` decodes to `she said "hi"`.
3. **No trimming.** Whitespace in unquoted fields is significant and preserved:
   `a , b` is `["a ", " b"]`.
4. Output is the array of decoded field strings, in order.

Do not parse with `line.split(',')` (breaks on quoted commas and leaves quote
characters in the output) or by stripping quotes without honoring `""` escapes.
