# Status-Driven Dashboard Emphasis Design

## Goal

Improve dashboard scanning by using the installed shadcn Badge variants to distinguish market movement and analysis-job state without changing the global theme or adding decorative card colors.

## Scope

- Market snapshot shows a primary badge for a positive move, destructive for a negative move, and outline for no movement or an unavailable move.
- Market snapshot header adds a semantic live-quote badge.
- Pipeline job status and current stage use primary for active work, secondary for completed work, destructive for failures, and outline for pending work.
- Recent report status uses the same variants for succeeded, running/queued, and failed jobs.

## Boundaries

- Reuse existing `Card`, `Badge`, and `Progress` components and their variants.
- Use semantic component variants only; do not add raw Tailwind color classes or global CSS tokens.
- Do not change API data contracts or add chart data.

## Testing

- Unit tests cover the variant applied to positive, negative, and unavailable price changes.
- Pipeline and report-list tests cover active and failed states as semantic variants.
