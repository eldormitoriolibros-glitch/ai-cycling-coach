# Docs

Two kinds of document live here. The reference docs describe the code as it is
today and are kept in sync with it. The plan docs are proposals written before
the work; each one carries a status banner saying how much of it actually
shipped, and they are not updated as the code moves on.

## Reference

| Document | What it covers |
| --- | --- |
| [`../README.md`](../README.md) | What the app does, local setup, planning and metrics |
| [`architecture.md`](architecture.md) | Stack, data flow, modules, the coach's prompt layers, security |
| [`deployment.md`](deployment.md) | Vercel, Supabase, webhooks, cron, secret rotation, cost |

## Plans

| Document | Status |
| --- | --- |
| [`coach-doctrine-plan.md`](coach-doctrine-plan.md) | Implemented |
| [`plan-decision-engine.md`](plan-decision-engine.md) | Implemented, except the what-if UI |
| [`plan-trends-and-whatif-ui.md`](plan-trends-and-whatif-ui.md) | Half implemented: snapshots yes, what-if panel no |
| [`i18n-plan.md`](i18n-plan.md) | Not started |
