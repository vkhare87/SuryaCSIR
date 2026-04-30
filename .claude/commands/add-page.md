# /add-page

Scaffold a new route page in SURYA and wire it up to the router and nav.

## Usage

```
/add-page <PageName> [route] [minRole]
```

Examples:
- `/add-page Vacancies /vacancies Admin`
- `/add-page pms/BulkExport /pms/export MasterAdmin`

## What this does

1. Creates `src/pages/<PageName>.tsx` (or `src/pages/pms/<PageName>.tsx` for pms/ prefix):
   - `export default function <PageName>() { ... }` skeleton
   - `useAuth()` + `useData()` imports
   - `useMemo` for any data dependencies
   - Page-transition `motion.div` wrapper
2. Registers route in `src/App.tsx` under the correct `<ProtectedRoute allowedRoles={[...]}>` block.
3. If `minRole` is not MasterAdmin/PMS-only, adds nav item to `NAV_ITEMS` in `src/components/layout/Layout.tsx`.

## Conventions enforced

- `export default function` (not arrow function)
- Data via `useData()` only — never direct Supabase call
- Computed values wrapped in `useMemo`
- Semantic Tailwind tokens only
