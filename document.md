# Folder & Source Structure Guide → moved

This guide's content now lives in
**[docs/architecture_addendum.md §4](docs/engineering/architecture_addendum.md#4-folder-structure)**.

It was last accurate on 2026-05-16 and had since drifted — it listed a `DatabaseWizard.tsx`
page that does not exist, a `supabase/seed.sql` that was replaced by `supabase/seed/`, and
roughly a third of the current `src/` tree. It also predated `src/lib/`, `rag/`, `ingest/`,
`deploy/`, and `scripts/`. Merged and corrected on 2026-08-08 rather than maintained as a
second copy alongside `docs/STRUCTURE.md`, which said much the same thing.

The one section with content found nowhere else — **why each file has to sit at the repo
root** — was carried over intact and corrected.

| Looking for | Go to |
|---|---|
| Repository layout and why each root file is where it is | [architecture_addendum.md §4](docs/engineering/architecture_addendum.md#4-folder-structure) |
| `src/` map and the layer rules | [architecture_addendum.md §4.2](docs/engineering/architecture_addendum.md#42-src) |
| "Where does this new file go?" decision tree | [CLAUDE.md → Where Things Live](CLAUDE.md), and [architecture_addendum.md §12](docs/engineering/architecture_addendum.md#12-extension-points) |
| Naming conventions per file kind | [coding_standards.md §3](docs/engineering/coding_standards.md#3-naming) |
