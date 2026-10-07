# Brand creator directory performance

The native brand home/Creators screen is implemented in `src/screens/BrandCreators.tsx`.

## Causes found in code

- Each of two rows allowed two mounted video players: four decoders despite the apparent single playing tile.
- Two 32 ms timers repeatedly called native scrollToOffset: approximately 62.5 scroll commands per second even while idle.
- Each row duplicated its creator data to support that scrolling loop.
- Horizontal visibility ignored whether a row was vertically outside the viewport.
- Live refreshes replaced the directory with loading skeletons, destroying and recreating rows and players.
- Failed lightweight previews automatically fell back to original uploads.
- Changing parent state recreated card callbacks and source objects, triggering unnecessary card/player updates.

## Changes

Rows remain swipeable; automatic marquee scrolling is removed. A single visible row owns playback, and only one video component can mount across both rows. Playback releases during scrolling, search focus, profile preview, backgrounding and when rows leave the viewport. Scrolling resumes playback after a 200 ms settling period.

Original uploads require an explicit play tap if no lightweight preview is available. Preview buffer configuration is capped at 3 seconds, compared with the previous 6 seconds per player; this is a configured limit, not a measured memory saving. Unchanged directory records, callbacks and source objects retain their identities across refreshes. Concurrent refresh requests are coalesced, and stale responses are ignored. Creator lists contain no duplicate loop entries and retain virtualization.

## Verification

Regression coverage includes 400 creators, one global player, zero idle scroll timers/commands over simulated 60 seconds, horizontal and vertical visibility, background/profile/search suspension, stable refreshes, explicit original playback, request coalescing and timer cleanup. TypeScript, focused ESLint and directory/media/live-update/navigation tests validate the changes.

No Android device was attached during this investigation. Native FPS, actual decoder teardown timing, memory and bandwidth have not been measured. For device verification, use a release build and the same directory fixture before and after the change:

```powershell
adb shell dumpsys gfxinfo com.ugcapp reset
# Exercise scrolling, search, profile opening and refresh for 60 seconds.
adb shell dumpsys gfxinfo com.ugcapp framestats
adb shell dumpsys meminfo com.ugcapp
```

Compare missed frames and memory on the same device. Verify that only one preview plays, off-screen previews stop, original uploads require a tap, and a live refresh keeps the existing cards visible.
