# App Load Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the requests and the JavaScript that a signed-in user pays for before the home page shows its numbers.

**Architecture:** Three small, independent changes. (1) Resolve the signed-in user once, and keep the `user` object stable, so nothing downstream refetches. (2) Load `DataContext` in two waves so the five tables the home page reads do not queue behind 27 others. (3) Move the signed-out pages out of the entry bundle. No new dependency, no cache layer, no new context.

**Tech Stack:** React 19, Vite 8, `@supabase/supabase-js` 2, Vitest.

**Spec:** none — this plan argues from the measurements below (taken 2026-11-16, `npm run dev`, Director role, warm Supabase project).

## Baseline (what was measured)

| Measure | Value | Cause |
|---|---|---|
| API calls on one home load | 79 | see rows below |
| `user_roles` / `user_profiles` reads | 4 / 5 | `getSession()` and the `INITIAL_SESSION` event both call `resolveUserRoles` (×2 again under dev StrictMode) |
| `general_meetings` reads | 5 | `Meetings.tsx:107` depends on the `user` object; each `setUser` makes a new one |
| `notices` reads | 4 | same re-render chain |
| `DataContext` reads | 32, all at once | one `Promise.all` at `DataContext.tsx:356` |
| One read alone / in the crowd | ~50 ms / ~700–1300 ms | the 60+ concurrent requests queue on the free-tier pool |
| Last API response | ~1.4 s | |
| Entry chunk `index-*.js` | 530 KB raw, 159 KB gzip | `Login`, `SetupWizard`, `ChangePassword` are static imports (`App.tsx:6-8`); a signed-in load fetched `NetworkCanvas`, `useCountUp`, `csir-mark.webp` |

Tables are small (staff 126 rows, projects 87). Row volume is not the problem; request count and contention are.

## Global Constraints

- Pages read data through `useData()` only. No page calls Supabase directly.
- No new dependency.
- `HashRouter` stays. No `tailwind.config.js`.
- Typecheck gate is `npm run build` (`npx tsc --noEmit` passes vacuously).
- No comments in code except where the project rules allow them.
- `DataContext`'s public shape does not change: `isLoading` still means "every slice has settled".

## Review Focus

1. Sign out, then sign in as a different account in the same tab → the second account's roles must resolve (the `SIGNED_IN` event must still run `resolveUserRoles`). Test in Task 1.
2. `switchRole` and `clearMustChangePassword` → `user` must become a new object (the stability check must not swallow a real change). Test in Task 1.
3. The first wave fails (network down) → the second wave still runs, `isLoading` ends `false`, and the existing warning toast shows. Test in Task 2.
4. The account changes between wave one and wave two → wave two's rows are dropped, not shown to the new account. Test in Task 2.
5. A signed-out visitor opens `/#/login` on a slow link → they see `RouteFallback`, not a blank page. Check in Task 3.

---

### Task 1: Resolve the user once and keep `user` stable

**Files:**
- Modify: `src/contexts/AuthContext.tsx:76-83` (the `setUser` in `resolveUserRoles`) and `:129` (the event skip list)
- Modify: `src/components/home/Meetings.tsx:107`
- Create: `src/contexts/AuthContext.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `useAuth().user` keeps the same object identity when a re-resolve returns the same `id`, `email`, `roles`, `activeRole`, `divisionCode`, `mustChangePassword`.

- [ ] **Step 1: Write the failing tests** in `src/contexts/AuthContext.test.tsx`. Mock `../utils/supabaseClient` the way `DataContext.test.tsx` does. The mock's `onAuthStateChange` stores the callback so the test can fire events.

```tsx
it('reads roles once when getSession and INITIAL_SESSION both report the same session', async () => {
  // getSession resolves { session }, then fire('INITIAL_SESSION', session)
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(fromCalls('user_roles')).toBe(1);
  expect(fromCalls('user_profiles')).toBe(1);
});

it('keeps the same user object when SIGNED_IN repeats with unchanged roles', async () => {
  const first = result.current.user;
  fire('SIGNED_IN', session);
  await waitFor(() => expect(fromCalls('user_roles')).toBe(2));
  expect(result.current.user).toBe(first);
});

it('resolves the new account when SIGNED_IN carries a different user id', async () => {
  fire('SIGNED_IN', otherSession);
  await waitFor(() => expect(result.current.user?.id).toBe(otherSession.user.id));
});

it('gives a new user object when switchRole changes activeRole', async () => {
  const first = result.current.user;
  await act(() => result.current.switchRole('Scientist'));
  expect(result.current.user).not.toBe(first);
  expect(result.current.user?.activeRole).toBe('Scientist');
});
```

- [ ] **Step 2: Run them and see the first two fail**

Run: `npx vitest run src/contexts/AuthContext.test.tsx`
Expected: FAIL — `expected 2 to be 1` and `expected {…} to be {…}` (identity).

- [ ] **Step 3: Add `INITIAL_SESSION` to the skip list** at `AuthContext.tsx:129`. `getSession()` at line 111 already covers the first session.

- [ ] **Step 4: Make the `setUser` at line 76 keep the previous object when nothing changed.** Use the functional form `setUser(prev => …)`. Compare `id`, `email`, `activeRole`, `divisionCode`, `mustChangePassword`, and `roles` joined with `,`. Return `prev` when all match, else the new object.

- [ ] **Step 5: Change the dependency at `Meetings.tsx:107`** from `[user]` to `[userId]`, where `const userId = user?.id`. The loader takes only the id.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/contexts/AuthContext.test.tsx src/components/home/Meetings.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/contexts/AuthContext.tsx src/contexts/AuthContext.test.tsx src/components/home/Meetings.tsx
git commit -m "Auth: resolve the user once and keep the user object stable"
```

---

### Task 2: Load `DataContext` in two waves

**Files:**
- Modify: `src/contexts/DataContext.tsx:350-503` (`loadData`)
- Test: `src/contexts/DataContext.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: no API change. Wave one = `divisions`, `staff`, `projects`, `project_staff`, `division_strength`, and `contract_staff` when `loadContracts` is true (the `hr` and `projects` slices). Wave two = every other read in today's `Promise.all`. `isLoading` turns `false` after wave two.

- [ ] **Step 1: Write the failing tests** in `DataContext.test.tsx`, using that file's existing Supabase mock. Give the mock a way to hold a table's response until the test releases it.

```tsx
it('shows divisions, staff and projects before the second wave settles', async () => {
  hold('committees');
  await waitFor(() => expect(result.current.divisions.length).toBe(2));
  expect(result.current.projects.length).toBe(1);
  expect(result.current.isLoading).toBe(true);
  expect(requested('committees')).toBe(true);
  release('committees');
  await waitFor(() => expect(result.current.isLoading).toBe(false));
});

it('does not request second-wave tables until the first wave has answered', async () => {
  hold('staff');
  await waitFor(() => expect(requested('divisions')).toBe(true));
  expect(requested('committees')).toBe(false);
  release('staff');
  await waitFor(() => expect(requested('committees')).toBe(true));
});

it('still runs the second wave and ends loading when a first-wave table errors', async () => {
  failTable('staff', 'boom');
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(requested('committees')).toBe(true);
  expect(pushToast).toHaveBeenCalledWith(expect.stringContaining('1 table(s) failed'), 'warning');
});

it('drops second-wave rows when the account changes between waves', async () => {
  hold('committees');
  await waitFor(() => expect(result.current.divisions.length).toBe(2));
  switchAccount('other-user');
  release('committees');
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.committees).toEqual([]);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/contexts/DataContext.test.tsx`
Expected: the first two FAIL (`divisions.length` stays 0 while `committees` is held; `requested('committees')` is `true`).

- [ ] **Step 3: Split the `Promise.all` at line 356 into two awaited groups.** After the first `await`: check `isCurrentLoad()`, then run the existing `isSliceCurrent('hr')` and `isSliceCurrent('projects')` blocks (lines 448-456). Then await the second group, check `isCurrentLoad()` again, and run the remaining slice blocks unchanged. Collect `tableErrors` across both waves and raise the one toast after wave two, as today. Do not add a new state field.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/contexts/DataContext.test.tsx src/contexts/contextMemo.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/DataContext.tsx src/contexts/DataContext.test.tsx
git commit -m "DataContext: load home-page tables first, the rest in a second wave"
```

---

### Task 3: Take the signed-out pages out of the entry bundle

**Files:**
- Modify: `src/App.tsx:6-8` and the routes that render `Login`, `SetupWizard`, `ChangePassword`

**Interfaces:**
- Consumes / Produces: nothing.

- [ ] **Step 1: Record the size before**

Run: `npm run build`
Then: `gzip -c dist/assets/index-*.js | wc -c`
Expected: about `163000` (159 KB). Write the number down.

- [ ] **Step 2: Change the three static imports to `lazy(() => import('./pages/…'))`**, the same form as `App.tsx:23`. `Dashboard` stays a static import: it is the landing page.

- [ ] **Step 3: Make sure each of the three routes sits under a `Suspense`.** The `Suspense` at `App.tsx:168` covers only its child routes. For a route outside it, wrap the element: `<Suspense fallback={<RouteFallback />}>…</Suspense>`.

- [ ] **Step 4: Build and compare**

Run: `npm run build`
Then: `gzip -c dist/assets/index-*.js | wc -c`
Expected: build passes; the number is lower than Step 1; `ls dist/assets | grep -E "^(Login|SetupWizard|ChangePassword)-"` lists three files.

- [ ] **Step 5: Check the signed-out path in the browser**

Run: `npm run preview`, open `/#/login` in a signed-out window.
Expected: the login page shows; no console error; `NetworkCanvas` is requested. Then sign in: the home page shows and the network list has no `Login-*.js` request on a later reload.

- [ ] **Step 6: Run the gates and commit**

Run: `npm run lint && npm test`
Expected: PASS.

```bash
git add src/App.tsx
git commit -m "App: lazy-load Login, SetupWizard and ChangePassword"
```

---

## Proof that the whole plan worked

Run `npm run build && npm run preview`, sign in as Director, reload the home page, then paste this in the browser console:

```js
const r = performance.getEntriesByType('resource').filter(e => e.name.includes('/rest/v1/'));
const n = {}; r.forEach(e => { const k = e.name.split('/v1/')[1].split('?')[0]; n[k] = (n[k] || 0) + 1; });
({ calls: r.length, lastMs: Math.round(Math.max(...r.map(e => e.responseEnd))), repeats: Object.entries(n).filter(([, c]) => c > 1) });
```

Targets (production build, so no StrictMode doubling): `user_roles` 1, `user_profiles` 1, `general_meetings` 1, `notices` 1; `divisions`, `staff`, `projects` answer in under 300 ms each.

## Left out on purpose

- **Supabase cold start.** The free project pauses when idle; the first load after a pause fails or takes many seconds. No code change fixes this. The fix is a paid plan.
- **A query cache (React Query / SWR).** A new dependency and a rewrite of every loader. Revisit only if the targets above are missed.
- **Per-page lazy slices in `DataContext`.** A bigger change to every page. Revisit when a table passes about 5,000 rows.
- **One `home_bootstrap` RPC.** Saves round trips but couples home to a new SECURITY DEFINER function. Revisit after Task 2 numbers.
- **Fonts.** Nine `@fontsource` CSS imports, but each font file loads only when a glyph needs it.
