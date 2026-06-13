# Conventions

Conventions every contribution to depot-cli follows.

## Version precedence

Versions follow Semantic Versioning 2.0.0 precedence. Ordering is **not**
string order. Determine precedence as follows:

1. Compare `major`, `minor`, `patch` **numerically**, in that order. Numeric —
   not string — comparison, so `1.10.0` is GREATER than `1.2.0` (10 > 2), even
   though it sorts earlier lexically.
2. A version WITH a pre-release tag has **lower** precedence than the
   associated normal version: `1.0.0-rc.1` < `1.0.0`.
3. Pre-release precedence compares dot-separated identifiers left to right:
   - Identifiers consisting only of digits are compared **numerically**
     (`alpha.2` < `alpha.10`).
   - Identifiers with letters are compared lexically in ASCII order
     (`alpha` < `rc`).
   - When all preceding identifiers are equal, a larger set of pre-release
     fields has higher precedence than a smaller set (`1.0.0-alpha` <
     `1.0.0-alpha.1`).
4. **Build metadata** (everything after a `+`) is IGNORED when determining
   precedence: `1.0.0+build.5` and `1.0.0+build.9` rank equal. The metadata is
   still preserved in the returned string.

Do **not** order versions with `Array.prototype.sort()` default ordering or
`localeCompare` (see `src/lib/strings.js`'s `lexicalCompare`). Lexical order is
correct for human-facing **name** listings only; it mis-orders numeric fields
and pre-release tags and is wrong for version precedence.

## Stability

`sortVersions` returns a new array and never mutates its input. Listings that
display by name use `src/lib/strings.js`; version precedence lives in
`src/core/versions.js`.
