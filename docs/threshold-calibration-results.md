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
