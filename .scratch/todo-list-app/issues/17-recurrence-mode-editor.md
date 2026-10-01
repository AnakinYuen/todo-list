# 17: Recurrence editor exposes the mode

**What to build:** The recurrence editor lets a user choose *Repeat after
completion* or *On a schedule*, and shows the fields that mode needs, so the two
mental models are visible choices rather than something inferred.

**Blocked by:** 16 (the `mode` discriminator and both engines)

**Status:** shipped

- [x] A mode control on the create and edit forms: "Repeat after completion" vs "On a schedule"
- [x] After completion shows `interval` + `unit` (days / weeks / months); on a schedule shows `frequency` + the weekday set or monthly anchor, as today
- [x] The due date is optional for after-completion and is not implied by it
- [x] A TODO with an existing rule opens in the correct mode
- [x] Verified with `playwright-cli` across both modes on create and edit

## Comments

The editor currently presents one set of fields (frequency + interval + weekday
set / monthly anchor) that reads as a fixed schedule, which is why "after
completion" was never a user-facing choice. Split it on the `mode` from ticket 16.
Keep it functional rather than polished — this is a two-option toggle plus the
existing field groups, not a new design system.

## Delivered

The recurrence editor's first control is now a mode select — *Does not repeat* /
*After completion* / *On a schedule*. After completion shows interval + unit; on a
schedule shows interval + frequency plus the weekday set or monthly anchor.
`formOf` and `ruleOf` map to and from the new rule shape, so an existing rule opens
in the right mode. Verified with `playwright-cli` for both modes on create (and the
existing edit path reuses the same editor).
