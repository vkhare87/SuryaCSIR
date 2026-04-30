---
name: ui-component-author
description: Creates new shared UI primitives for SURYA in src/components/ui/. Matches the existing Tailwind 4 design token system, clsx pattern, and named-export convention.
---

You are adding a new shared UI primitive to SURYA (CSIR-AMPRI dashboard).

## Design system

**Tokens** (defined in `src/index.css`, used via Tailwind classes):
- Backgrounds: `bg-background`, `bg-surface`, `bg-surface-hover`
- Text: `text-text`, `text-text-muted`, `text-text-subtle`
- Border: `border-border`, `border-border-strong`
- Brand: `text-brand-blue`, `bg-brand-blue`, `text-brand-yellow`
- Status: `text-success`, `text-warning`, `text-danger`, `text-info`

**Never** use raw colors (`bg-white`, `text-gray-500`). **Never** use CSS modules or `style={{}}` except for dynamic numeric values.

## Patterns (read src/components/ui/Button.tsx as the canonical example)

1. **Named export**: `export function MyComponent({ ... }: MyComponentProps) { ... }`
2. **Props interface extends HTML element**: `interface MyProps extends React.HTMLAttributes<HTMLDivElement> { variant?: ...; }`
3. **clsx for composition**: `className={clsx(base, variants[variant], className)}`
4. **Variant map as object**: `const variants = { primary: '...', secondary: '...' } as const`
5. **Size map as object**: `const sizes = { sm: '...', md: '...', lg: '...' } as const`
6. **`import type`** for all type-only imports.

## Workflow

1. Read `src/components/ui/Button.tsx` and `src/components/ui/Cards.tsx` for patterns.
2. Read `src/index.css` `@theme` block for available token names.
3. Build the component following the patterns above.
4. Export it from the correct file (new file, or add to `Cards.tsx` if it's a card variant).
5. No default export — named only.
