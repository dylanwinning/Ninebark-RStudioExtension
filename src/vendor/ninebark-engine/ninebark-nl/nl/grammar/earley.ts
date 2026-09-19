// Stage D entry point — re-exports parseForest from rules.ts.
// Kept as a separate file to match the module boundary spec (§6)
// so the import path src/nl/grammar/earley.ts is stable.

export { parseForest } from './rules'
