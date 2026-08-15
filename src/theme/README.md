/**
 * How to extend the design system
 *
 * 1. Tokens — add values in `src/theme/tokens.ts` (spacing, radius, colors, control heights).
 * 2. Theme — map tokens in `create-app-theme.ts` (MUI `components` / palette) and `css-vars.ts`
 *    (legacy `--*` + `--cx-*`). Keep `theme_setting` field semantics unchanged.
 * 3. App UI — add a wrapper under `src/components/ui/` that reads theme/tokens only.
 *    Export it from `src/components/ui/index.ts`.
 * 4. Pages — import from `@/components/ui` (or re-exports via `@/components/base` during migration).
 *    Do not hardcode hex colors or magic visual px in feature code.
 */
export {}
