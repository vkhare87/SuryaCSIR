# Data Model → moved

The schema reference now lives in **[database_design.md](engineering/database_design.md)**.

This file's content was merged there on 2026-08-08 and extended from ~30 tables to all 65,
adding ER diagrams, the full index inventory, the migration strategy, and the retention
policy. Keeping two column-level references in sync was not worth the drift risk.

| Looking for | Go to |
|---|---|
| Any table's columns, constraints, indexes, RLS | [database_design.md §3](engineering/database_design.md#3-tables) |
| ER diagrams | [database_design.md §2](engineering/database_design.md#2-entity-relationship-overview) |
| Migration rules and apply order | [database_design.md §5](engineering/database_design.md#5-migration-strategy) |
| RPC signatures and authorization | [api_spec.md Part B](engineering/api_spec.md#part-b--rpc-api) |
| PMS state machine | [system_design.md §4.1](engineering/system_design.md#41-pms-report--pms_reportsstatus) |
