# Threshold calibration results

## Working batch — 3 September 2026

Environment: local desktop calibration screen, Supabase exact cosine search, one enrolled item (`Suduri`) with five enrollment photos. Query photos were held out from enrollment.

| Expected | Query | Nearest item | Score | Decision at 0.70 |
| --- | --- | --- | ---: | --- |
| Suduri | `suduri1.jpeg` | Suduri | 0.7809 | Confident, correct |
| Suduri | `suduri2.jpeg` | Suduri | 0.7450 | Confident, correct |
| Suduri | `suduri3.jpeg` | Suduri | 0.7801 | Confident, correct |
| Suduri | `suduri4.jpeg` | Suduri | 0.7632 | Confident, correct |
| Unknown | `WhatsApp Image 2026-09-03 at 11.13.49 PM (2).jpeg` | Suduri | 0.6151 | Not sure, correct |
| Unknown | `WhatsApp Image 2026-09-03 at 11.13.50 PM (1).jpeg` | Suduri | 0.5635 | Not sure, correct |
| Unknown | `WhatsApp Image 2026-09-03 at 11.13.50 PM.jpeg` | Suduri | 0.6309 | Not sure, correct |
| Unknown | `WhatsApp Image 2026-09-03 at 11.13.51 PM.jpeg` | Suduri | 0.6038 | Not sure, correct |

Known minimum: `0.7450`. Unknown maximum: `0.6309`. Observed gap: `0.1141`. The `0.70` working cutoff leaves `0.0450` below the weakest known result and `0.0691` above the strongest unknown result.

This is not a final threshold. Repeat with several enrolled objects, visually similar unknowns, different lighting, and the intended phone before closing WP-7.

## Snakers hard-negative batch — 4 September 2026

Eight held-out Snakers photos scored from `0.7782` to `0.8998`. Eight unknown photos, including visually similar chip packets, had a highest Snakers score of `0.7636`.

Known minimum: `0.7782`. Unknown maximum: `0.7636`. Observed gap: `0.0146`. A provisional cutoff of `0.77` is used for objects; medicines and faces retain the `0.70` default until separately calibrated.

The margin is narrow, so this cutoff is appropriate for the current demo only. Recalibrate with additional products and live camera images before production use.

Patient-mode object camera results from `0.77` up to (but not including) `0.80` require a second live frame. The item is returned only when the second frame also passes its cutoff and identifies the same item. This confirmation band addresses observed borderline false positives that disappeared on an immediate retake.

Calibration labels are global: a photo of any enrolled item must use that item's label as the expected result. The Unknown setting is reserved for objects that have not been enrolled anywhere. Cross-item photos incorrectly marked Unknown produce misleading unsafe-match rows even when the model identifies the enrolled item correctly.

Live phone validation passed on 4 September 2026 after applying the object-type policy. Enrolled objects remained recognisable, genuinely unenrolled objects followed the not-sure path, and borderline object results used the second-frame confirmation flow successfully.
