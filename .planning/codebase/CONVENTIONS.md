# Coding Conventions

_Last updated: 2026-04-07_

## Summary

SURYA is a React 19 / TypeScript 5.9 frontend using Tailwind CSS v4 for all styling. Conventions are largely implicit — no Prettier config, no custom ESLint rules beyond the standard typescript-eslint + react-hooks preset. Patterns are consistent across the codebase and can be inferred reliably from existing files.

---

## TypeScript Patterns

**Strict mode is on.** `tsconfig.app.json` enables `strict`, `noUnusedLocals`, `noUnusedParameters`, and `verbatimModuleSyntax`. All new code must pass these checks.

**Interfaces for shapes, `type` for aliases and unions.**
- Object shapes (entity models, context types, prop types): always `interface`
- Union types, simple aliases, enum-like strings: always `type`

```typescript
// src/types/index.ts — entity shapes
export interface StaffMember { ... }
export interface Equipment { ... }

// src/types/index.ts — union/alias types
export type Role = 'MasterAdmin' | 'Admin' | 'User';
export type UIDensity = 'compact' | 'medium' | 'relaxed';
export type ThemeMode = 'light' | 'dark' | 'system';
```

**`type` keyword on imports (verbatimModuleSyntax).** Because `verbatimModuleSyntax` is enabled, type-only imports must use `import type`:

```typescript
// Correct — used throughout contexts
import type { UserAccount, Role } from '../types';
import type { ReactNode } from 'react';
```

**Generics on components.** The `DataTable` component (`src/components/ui/DataTable.tsx`) is generic over its data type `T`, with typed `Column<T>` and `DataTableProps<T>` interfaces. Follow this pattern for any new reusable data components.

**Non-null assertion on root mount.** `src/main.tsx` uses `document.getElementById('root')!` — acceptable only at the single entry point.

**`any` used deliberately in mapper and migration layers.** `src/utils/dataMapper.ts` and `src/utils/dataMigration.ts` use `any` for raw Supabase row data, which is intentional since the DB schema may not match TypeScript types exactly. Avoid `any` in UI components and hooks.

**Discriminated union props.** Component prop types extend native HTML element interfaces:

```typescript
// src/components/ui/Button.tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}
```

**Optional chaining and nullish coalescing are used throughout.** Prefer `?.` and `??` over manual null guards in render code.

---

## React Patterns

**All components are function components.** No class components anywhere in the codebase.

**Default export for pages, named export for UI components and contexts.**

```typescript
// Pages — default export
export default function Dashboard() { ... }
export default function HumanCapital() { ... }

// UI components — named export
export function Button({ ... }: ButtonProps) { ... }
export function Card({ ... }: CardProps) { ... }
export function DataTable<T>({ ... }: DataTableProps<T>) { ... }

// Contexts — named exports for both provider and hook
export function AuthProvider({ children }: { children: ReactNode }) { ... }
export function useAuth() { ... }
```

**Context pattern is standardized across all four contexts** (`src/contexts/`):
1. Define a `XxxContextType` interface
2. Create context with `createContext<XxxContextType | undefined>(undefined)`
3. Export a `XxxProvider` component that provides the value
4. Export a `useXxx` hook that throws if called outside the provider

```typescript
// Pattern from src/contexts/AuthContext.tsx (and all other contexts)
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

**`useMemo` for all derived/computed data in pages.** Every computed dataset (filtered lists, aggregated stats, chart data) in page components is wrapped in `useMemo` with explicit dependency arrays. This is the primary performance pattern.

```typescript
// src/pages/Dashboard.tsx — representative pattern
const humanCapitalStats = useMemo(() => {
  const permanent = staff.length;
  // ...
  return { permanent, project, phd, groups };
}, [staff, projectStaff, phDStudents]);
```

**`useState` initialized with lazy initializer for localStorage reads.**

```typescript
// src/contexts/ThemeContext.tsx
const [theme, setTheme] = useState<ThemeMode>(
  () => (localStorage.getItem('surya_theme') as ThemeMode) || 'light'
);
```

**`useEffect` cleanup pattern for event listeners.**

```typescript
// src/components/layout/Layout.tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => { ... };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

**Inline sub-components declared as named functions inside parent component.** Used in `Layout.tsx` for `SidebarContent` — a function component declared inside `Layout()` with a prop to switch between desktop and mobile rendering. Use sparingly; prefer separate files for reusable components.

**ESLint disable comments are used to suppress false positives**, not to bypass legitimate rules:
- `/* eslint-disable react-refresh/only-export-components */` at top of each context file (because contexts export both provider and hook)
- `// eslint-disable-next-line react-hooks/exhaustive-deps` where a dependency would cause an infinite loop and omission is intentional

---

## Naming Conventions

**Files:**
- Pages: `PascalCase.tsx` — e.g., `HumanCapital.tsx`, `SetupWizard.tsx`, `PhDTracker.tsx`
- UI components: `PascalCase.tsx` — e.g., `DataTable.tsx`, `Cards.tsx`, `Button.tsx`
- Contexts: `PascalCase + Context.tsx` — e.g., `AuthContext.tsx`, `DataContext.tsx`
- Utilities: `camelCase.ts` — e.g., `dataMapper.ts`, `dataMigration.ts`, `dateUtils.ts`, `mockData.ts`, `supabaseClient.ts`
- Types: `index.ts` (single file in `src/types/`)

**Components:** PascalCase — `Dashboard`, `StatCard`, `DataTable`, `TableSkeleton`

**Hooks:** `use` prefix + PascalCase — `useAuth`, `useData`, `useTheme`, `useUI`

**Context instances:** PascalCase + `Context` — `AuthContext`, `DataContext`

**Variables and functions:** camelCase — `filteredStaff`, `retirementList`, `handleLogin`, `loadData`

**Constants (module-level):** SCREAMING_SNAKE_CASE — `NAV_ITEMS`, `SCHEMA_MAPS`, `ALLOWED_COLUMNS`, `BATCH_SIZE`

**Type/Interface names:** PascalCase + descriptive suffix — `AuthContextType`, `DataContextType`, `ButtonProps`, `StatCardProps`, `DataTableProps<T>`, `Column<T>`

**Entity field names follow the source data casing** (PascalCase from Excel headers): `StaffMember.ID`, `StaffMember.Name`, `ProjectInfo.ProjectNo`, `Equipment.UInsID`. This is intentional to match Supabase column names from the migration pipeline.

---

## Import Organization

No enforced order beyond what ESLint requires. Observed pattern in files:

1. React and third-party libraries (`react`, `react-router-dom`, `lucide-react`, `recharts`, `clsx`, `motion`)
2. Internal contexts (`../contexts/AuthContext`, `../../contexts/UIContext`)
3. Internal components (`../components/ui/Cards`, `./CommandPalette`)
4. Internal utilities (`../utils/dateUtils`, `../utils/supabaseClient`)
5. Internal types (`../types`, `../../types`)

No path aliases configured — all imports use relative paths (`../../`, `../`, `./`).

**Named vs. default imports** follow the export convention: pages are imported as default, UI primitives and context hooks as named:

```typescript
import Dashboard from './pages/Dashboard';             // default
import { Card, Badge, StatCard } from '../components/ui/Cards'; // named
import { useAuth } from '../../contexts/AuthContext';   // named hook
```

---

## Error Handling

**Async data loading uses try/catch with console.error.** The `DataContext` catches Supabase errors with a generic log and falls back gracefully (data arrays remain at their initialized empty state):

```typescript
// src/contexts/DataContext.tsx
try {
  // Supabase fetches
} catch (e) {
  console.error("Failed to load generic data", e);
} finally {
  setIsLoading(false);
}
```

**File parsing uses a resolve-only Promise pattern** — `parseFile` in `src/utils/dataMigration.ts` never rejects; it always resolves with `{ success: false, error: string }` on failure.

**Not-found UI in detail pages.** When a route param doesn't match a record, detail pages render an inline error state and a back button:

```typescript
// src/pages/StaffDetail.tsx
if (!member) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
      <p className="text-text-muted mb-4">Staff member not found.</p>
      <Button onClick={() => navigate('/staff')} variant="secondary">Go Back</Button>
    </div>
  );
}
```

**No global error boundary.** There is no `ErrorBoundary` component wrapping the app.

**Form errors are inline state.** `Login.tsx` uses `const [error, setError] = useState('')` and renders the error string in JSX. Use this pattern for all forms.

---

## CSS / Styling Approach

**Tailwind CSS v4 exclusively.** No CSS modules, no styled-components, no inline `style` objects except for dynamic values that cannot be expressed as classes (e.g., `style={{ width: '${pct}%' }}`).

**Class composition uses `clsx`.** The `clsx` package (imported as `import clsx from 'clsx'`) is used for conditional class merging. The `tailwind-merge` package is installed but not yet actively used in components — `clsx` is the convention.

```typescript
// src/components/ui/Button.tsx
className={clsx(baseStyle, variants[variant], sizes[size], className)}

// src/components/ui/DataTable.tsx
className={clsx("border-b border-border/50 hover:bg-surface-hover", onRowClick && "cursor-pointer")}
```

**Design token system via CSS custom properties.** `src/index.css` defines semantic color tokens as CSS variables under `:root` (light) and `.dark` (dark theme), registered in the `@theme` block for Tailwind to consume:

```css
/* Light theme */
--color-background: #F8FAFC;
--color-surface: #FFFFFF;
--color-border: #E2E8F0;
--color-text: #0F172A;
--color-text-muted: #64748B;

/* Brand colors */
--color-brand-blue: #0B4DA2;
--color-brand-yellow: #FFD700;
```

**Always use semantic token classes, never raw color values in component JSX.** Use `bg-surface`, `text-text-muted`, `border-border`, `text-brand-blue` — not `bg-white`, `text-gray-500`, `text-blue-700`. Raw hex values appear only in `index.css` and in chart `fill` props (where Tailwind classes cannot be used).

**Density system.** `data-density` attribute on `<html>` drives CSS variables `--density-padding-base` and `--density-gap-base`. Use the utility classes `.p-density` and `.gap-density` where density-aware spacing is needed.

**Dark mode via class strategy.** The `dark` class is toggled on `<html>` by `ThemeContext`. Use `dark:` variants in Tailwind for dark-specific overrides.

**Animation.** `framer-motion` (`motion` package) is used for page transitions and mobile sidebar. Use `<motion.div>` with `initial/animate/exit` props for any animated elements. `<AnimatePresence>` wraps conditionally rendered animated elements.

---

## Comment and Documentation Style

**JSDoc used only for utility functions**, not for components or context hooks. Utility files (`src/utils/dateUtils.ts`, `src/utils/dataMapper.ts`) use `/** ... */` block comments for exported functions:

```typescript
/**
 * Shared date utilities for CSIR-AMPRI data formats.
 * Supported formats: DD.MM.YYYY | DD/MM/YYYY | YYYY-MM-DD
 */
export function parseDate(dateStr: string | undefined | null): Date | null { ... }

/**
 * Fuzzy name matcher for publications/IP data where authors may be abbreviated.
 * e.g. staff "Dr. Sanjeev Saxena" matches author "S. Saxena"
 */
export function staffNameMatchesAuthor(...): boolean { ... }
```

**Inline comments explain non-obvious logic.** Section dividers inside large page components use `// --- N. Section Name ---` style:

```typescript
// --- 1. Human Capital Metrics ---
// --- 2. Demographics & Distribution ---
```

**`// TODO:` marks planned work** — only one exists in the codebase: `// TODO: Supabase auth verification when provisioned` in `src/contexts/AuthContext.tsx`.

**`// Hardcoded ... for now` pattern** is used to flag temporary implementations.

Component prop types are self-documenting via the interface definition — no JSDoc on props.
