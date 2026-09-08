# Project Scope Rules

- Make changes only inside this `ugcapp` native application workspace.
- Never edit the separate UGCad website or frontend repository.
- Do not modify files under `C:\Users\meetr\Desktop\ugc\Frontend` or any other website project.
- If a requested UI currently comes from the website through the WebView, implement the requested behavior in the native app layer or explain the native-app limitation before proceeding.

## Typography

Two families, wired in `src/theme.ts`:

| Role | Family | Weights | Used for |
| --- | --- | --- | --- |
| Display | Readex Pro | 500, 600 | H1–H3, screen titles, logo wordmark, stat numbers |
| Body / UI | Just Sans → **Inter** | 400–800 | Body copy, labels, captions, table cells, inputs |

**Just Sans is not bundled** — it is a commercial licence and no free source
exists. Per the type spec, Inter is the sanctioned fallback and is what every
body style currently resolves to. To switch once licensed: drop the
`JustSans-*.ttf` files into `assests/fonts`, run `npx react-native-asset`, and
change the postscript names in the `body` block of `src/theme.ts`. No screen
needs editing — nothing outside `theme.ts` names a font file.

### Rules

- **Never set `fontWeight` alone.** Android will not synthesise weights for a
  custom family: `fontFamily: 'Inter-Regular'` + `fontWeight: '800'` renders
  regular. Weight is chosen by *picking a different file*, which is why every
  `fontWeight` in `src/` sits next to an explicit `fontFamily`.
- Prefer the `type` roles over hand-rolled sizes:
  `title: { ...type.h2, color: colors.white }`.
- For a weight the roles don't cover, use the helpers, which map a weight onto
  the right bundled face: `...bodyFont(700)` or `...displayFont(600)`.
- `fontFamily` strings are **PostScript names** read out of the TTFs, not
  filenames. A wrong name fails silently to the system face.

## Responsive sizing

Every layout number in `src/` is scaled from a **390x844 design reference**
(iPhone 13/14, matching the Figma frames). Helpers live in `src/theme.ts`:

| Helper | Use for |
| --- | --- |
| `scale(n)` | Default. Padding, width, radius, icon boxes, gaps, offsets |
| `verticalScale(n)` | Heights that should breathe on tall screens (hero blocks, spacers) |
| `fontScale(n)` | `fontSize` and `lineHeight` |

Scaling keys off the **short edge**, so rotating a device does not reflow the
layout, and is clamped to **0.85x–1.25x**. The cap is deliberate: a linear scale
would render an iPad at 2.1x, which reads as a zoomed-in phone rather than a
tablet layout. Type is damped further (`FONT_DAMPING`), so text grows more
slowly than the boxes around it.

At exactly 390pt every helper returns its input unchanged — the reference
layout is untouched. `__tests__/responsive.test.tsx` locks that in.

### Rules

- **Never write a bare number for a dimension.** `padding: 16` → `padding: scale(16)`.
  `__tests__/responsive*.test.tsx` plus the audit in the scaling commit assume this.
- **Do not scale:** `flex`, `borderWidth`, `opacity`, `elevation`, `zIndex`,
  `shadowOpacity`, `strokeWidth`, and 1px hairline dividers (`height: 1`) — a
  scaled hairline can round to 0 and disappear.
- **Do not scale non-style numbers**: timings (`AUTOSCROLL_MS`), money
  (`COMMISSION_RATE`), counts (`TOP_N`), or image intrinsics (`IMAGE_W`).
- **Already-proportional values** (e.g. `Dimensions.get('window').width * 0.42`)
  are screen-relative already — scaling them again compounds the two. Pass
  `raw` to `SkeletonBlock` for these.
- **Text**: import `Text`/`TextInput` from `src/components/Text`, not from
  `react-native`. The wrapper caps OS font scaling at `MAX_FONT_SCALE` (1.3);
  uncapped, large accessibility settings overflow fixed-height rows and badges.
