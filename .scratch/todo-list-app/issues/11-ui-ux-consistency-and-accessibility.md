# 11: UI/UX consistency and accessibility pass

**What to build:** The whole web UI reads as one coherent, usable product — a
consistent layout, human-readable labels, explicit loading / empty / error /
conflict states, keyboard- and screen-reader-friendly controls, and a layout that
works in a narrow window. This is a cross-cutting sweep over the finished feature
UI, verified by actually looking at it rather than only building it.

**Blocked by:** 04 (Soft delete), 05 (Filter, sort and pagination), 06 (Dependencies), 08 (Recurrence anchors and custom)

**Status:** shipped

- [x] A consistent page layout: a real content container width, aligned forms and lists, consistent headings and spacing
- [x] Every domain value shown to the user uses a human label (Status, Priority, due date) — never a raw enum token
- [x] Loading, empty and error states are explicit for list load, create, edit and status changes; a 409 conflict is clearly explained
- [x] Accessibility: every control is labelled, focus order is logical, async results are announced (`aria-live`), buttons have descriptive names
- [x] Usable at a narrow viewport (e.g. 360px) as well as a wide one
- [x] Verified with `playwright-cli` screenshots across the key states (empty list, populated list, editor open, status change, error/conflict, narrow width)
- [x] No console errors or warnings in the covered flows

## Comments

Cross-cutting sweep, deliberately placed after the feature tickets so it is a
single pass over the finished surface rather than rework.

Out of scope: a design system, theming, animations, a component library —
gold-plating against the brief, which says the UI need only be functional and
usable.

Verification stays within the two agreed test seams: the checks here are
`playwright-cli` screenshots (a dev tool), not a new committed browser-test seam.

## Delivered

**Layout.** `main.page` is a centred, max-width container; the page is split into
labelled `h2` sections (Add a TODO, Filter and sort, TODOs, Selected TODO) with
consistent spacing. The stylesheet gained `box-sizing`, a focus ring, and a
`max-width: 30rem` media query that stacks the filter controls and lets form
actions fill the row at 360px.

**Labels.** The editor's Priority select now shows `Low`/`Medium`/`High`
(fixed — it rendered the raw enum before), and due dates render through
`format.ts` as `4 Jan 2027` in both the list and the next-occurrence hint
(parsed by parts, so no timezone shift). Status and Priority already used shared
label maps in filters and the list.

**States.** `App` tracks `loading` (initial list, refresh, load-more) and
`creating`; TodoEditor/StatusControls/DependencyEditor track their own pending
state via a shared `usePending` hook (one `try/finally` lifecycle, so the delete
confirmation now awaits the actual request rather than flashing), showing
`Saving…`/`Applying…`/`Adding…`/`Deleting…` while disabling their controls. Empty
shows "No TODOs match these filters.", distinct from a load error.
`describeError` gained the `DEPENDENCY_LIMIT` case and is now used for every
surfaced failure (a 409 reads "This TODO changed elsewhere…").

**Accessibility.** The create form's Name and Due date have visible labels (the
aria-label overrides were removed). List links are named "Open <name>" and badge
blockers "Open blocker <name>" / "Remove dependency <name>". The list region has
`aria-busy` plus a visually-hidden `role="status"` announcing "Showing N TODOs";
the next-occurrence hint and confirmations announce via `role="status"`/`alert`.

**Verification.** `playwright-cli` walks against the seeded dev list: populated,
empty (In Progress + Low), editor open, next-occurrence preview on completing the
recurring TODO, blocked-transition 422 message, delete confirmation naming the
dependent it unblocks, and a 360px screenshot. Console: 0 errors, 0 warnings
(the one logged 422 is Chromium's expected network log for a rejected request,
not an app error). No committed browser tests, per this ticket's Comments.

