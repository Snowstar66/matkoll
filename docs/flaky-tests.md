# Flaky e2e tests (quarantined)

These tests are tagged `@flaky` in their titles. CI blocks on everything else (`--grep-invert @flaky`)
and runs these in the non-required job `e2e-flaky` (`continue-on-error`), so failures stay visible.
Each failed intermittently while main stayed green. Fix the cause, then remove the tag.

| File | Test | What failed |
| --- | --- | --- |
| tests/e2e/shell.spec.ts | the P button at the right of every tab's header opens a sheet... (Story 19.2) | Intermittent failure in CI, passes on rerun |
| tests/e2e/shell.spec.ts | Hjälp och tips opens on the area of the tab the P button was opened from... | Intermittent failure in CI, passes on rerun |
| tests/e2e/shopping-look.spec.ts | at 200 % text the buttons stack... | Intermittent failure in CI, passes on rerun |
| tests/e2e/recipe-missing.spec.ts | a reload keeps På listan... | Intermittent failure in CI, passes on rerun |
| tests/e2e/settings.spec.ts | Ta bort turns koket.se off at once... | Intermittent failure in CI, passes on rerun |
| tests/e2e/place-photo-save.spec.ts | a confirmation saves the photo once... | Intermittent failure in CI, passes on rerun |
| tests/e2e/eat-first.spec.ts | IDÉER answers like a friend... | Intermittent failure in CI, passes on rerun |

To un-tag: delete ` @flaky` from the title and from this list.
