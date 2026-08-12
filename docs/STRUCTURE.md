# Codebase Structure → moved

The folder map and "where things live" cheatsheet now live in
**[architecture_addendum.md §4](engineering/architecture_addendum.md#4-folder-structure)**.

This file was last accurate on 2026-04-30 and had since drifted badly — it described a
single `00000000000000_init.sql` migration (there are 31), listed roughly a third of the
current pages, and predated `src/lib/`, `src/hooks/`, `src/constants/`, `rag/`, and
`ingest/` entirely. It was merged and corrected on 2026-08-08 rather than maintained in
two places.

| Looking for | Go to |
|---|---|
| Repository layout, `src/` map, layer rules | [architecture_addendum.md §4](engineering/architecture_addendum.md#4-folder-structure) |
| "How do I add a page / entity / migration?" | [architecture_addendum.md §12](engineering/architecture_addendum.md#12-extension-points) and [development_guide.md §3.2](engineering/development_guide.md#32-adding-common-things) |
| Naming conventions per file kind | [coding_standards.md §3](engineering/coding_standards.md#3-naming) |
