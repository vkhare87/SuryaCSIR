---
name: ui-design-system
description: SURYA's Tailwind 4 design token system, component conventions, and animation patterns. Read before writing any new UI.
---

## Color Tokens

All tokens defined as CSS custom properties in `src/index.css`. Use via Tailwind classes.

### Backgrounds
| Class | Use |
|-------|-----|
| `bg-background` | Page/app background |
| `bg-surface` | Cards, panels, modals |
| `bg-surface-hover` | Hover state on interactive surface |

### Text
| Class | Use |
|-------|-----|
| `text-text` | Primary content |
| `text-text-muted` | Secondary content, captions |
| `text-text-subtle` | Disabled, placeholders |

### Brand
| Class | Use |
|-------|-----|
| `text-brand-blue` / `bg-brand-blue` | CSIR blue (#0B4DA2) |
| `text-brand-yellow` / `bg-brand-yellow` | CSIR yellow (#FFD700) |

### Borders
| Class | Use |
|-------|-----|
| `border-border` | Default divider |
| `border-border-strong` | Emphasis divider |

### Status
`text-success`, `text-warning`, `text-danger`, `text-info` — with `bg-success/10` etc. for chip backgrounds.

**Never** use raw Tailwind colors (`bg-white`, `text-gray-500`, `text-blue-700`) in JSX. Raw hex/hsl values are only in `src/index.css` and chart `fill` props.

---

## Dark Mode

Dark mode via `dark:` Tailwind variant. The `dark` class is toggled on `<html>` by `ThemeContext`.

```tsx
className="bg-surface dark:bg-surface text-text dark:text-text"
// Usually tokens already handle dark — only add dark: when you need a different value
```

---

## Density System

`data-density` on `<html>`: `compact` | `medium` | `relaxed`. Use utility classes:
- `.p-density` — padding that responds to density
- `.gap-density` — gap that responds to density

---

## Component Conventions

### Class composition
```tsx
import clsx from 'clsx';

// Variant + size maps as const objects
const variants = {
  primary: 'bg-brand-blue text-white hover:bg-brand-blue/90',
  secondary: 'bg-surface border border-border text-text hover:bg-surface-hover',
  ghost: 'text-text-muted hover:bg-surface-hover',
  danger: 'bg-danger/10 text-danger hover:bg-danger/20',
} as const;

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
} as const;

// Apply
className={clsx(base, variants[variant], sizes[size], className)}
```

### Props interface
```tsx
interface MyProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}
```

### Named export (not default)
```tsx
export function MyComponent({ variant = 'primary', size = 'md', className, ...rest }: MyProps) {
```

---

## Animation

**Page transitions** — wrap page content in:
```tsx
import { motion } from 'motion/react';

<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -8 }}
  transition={{ duration: 0.15 }}
>
  {/* page content */}
</motion.div>
```

**Conditional elements** — wrap with `<AnimatePresence>`:
```tsx
import { AnimatePresence, motion } from 'motion/react';

<AnimatePresence>
  {isOpen && (
    <motion.div
      key="modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* modal content */}
    </motion.div>
  )}
</AnimatePresence>
```

Mobile sidebar in `Layout.tsx` uses this pattern — refer there for a full example.

---

## Shared Primitives (src/components/ui/)

| Component | Import | Key props |
|-----------|--------|-----------|
| `Button` | `import { Button } from '../components/ui/Button'` | `variant`, `size`, `isLoading` |
| `Card` | `import { Card } from '../components/ui/Cards'` | standard div with surface styling |
| `StatCard` | `import { StatCard } from '../components/ui/Cards'` | `title`, `value`, `subtitle`, `icon` |
| `Badge` | `import { Badge } from '../components/ui/Cards'` | `variant` |
| `DataTable<T>` | `import { DataTable } from '../components/ui/DataTable'` | `columns: Column<T>[]`, `data: T[]` |
| `Skeleton` | `import { Skeleton } from '../components/ui/Skeleton'` | shimmer loading state |

Read the source file before adding props — extend via the HTML interface pattern, don't wrap.
