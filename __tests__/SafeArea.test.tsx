/**
 * @format
 * Guards the safe-area contract at the source level.
 *
 * Contract: exactly ONE layer owns the top inset.
 *  - Screens rendered inside WebShell sit in its SafeAreaView (top edge), so
 *    their headers must NOT add insets.top themselves — doing both counted the
 *    status bar twice and visibly doubled every header's height.
 *  - Screens rendered OUTSIDE that SafeAreaView (the profile setups mounted
 *    straight from App.tsx, and full-screen Modals, which escape any ancestor
 *    SafeAreaView) get no padding from the shell and must pad themselves.
 *
 * These are source assertions rather than render assertions on purpose: the
 * bug class is "a screen handles the inset in the wrong layer", which only a
 * sweep over every screen can catch without mounting all 42 with fixtures.
 */
// @types/node is not a dependency of this app, so the few Node globals this
// source-level test needs are declared here rather than pulling in the package.
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

const SCREENS = path.join(__dirname, '..', 'src', 'screens');

/**
 * Screens that render outside WebShell's SafeAreaView and therefore must add
 * insets.top to their own header bar:
 *  - BrandProfileSetup / CreatorProfileSetup: mounted directly by App.tsx.
 *  - WorkRevisionRequest: shown inside a full-screen Modal.
 * (NotificationFeed is also a Modal but positions itself from a computed
 * topInset rather than a header style, so it is asserted separately.)
 */
const SELF_PADDED = [
  'BrandProfileSetup.tsx',
  'CreatorProfileSetup.tsx',
  'WorkRevisionRequest.tsx',
];

type ScreenFile = { name: string; src: string };

const files: ScreenFile[] = fs
  .readdirSync(SCREENS)
  .filter((name: string) => name.endsWith('.tsx'))
  .map((name: string) => ({
    name,
    src: fs.readFileSync(path.join(SCREENS, name), 'utf8') as string,
  }));

test('outside-shell screens pad their header by the top inset', () => {
  const offenders = SELF_PADDED.filter(name => {
    const file = files.find(f => f.name === name);
    return !file || !/paddingTop: insets\.top/.test(file.src);
  });
  expect(offenders).toEqual([]);
});

test('in-shell screens do not double-pad their headers', () => {
  // WebShell's SafeAreaView already clears the status bar for everything it
  // renders; a header that adds insets.top on top of that grows by a full
  // status-bar height. NotificationFeed passes insets.top into a Modal-local
  // offset, which is fine — only header/subHeader styles are swept.
  const offenders = files
    .filter(f => !SELF_PADDED.includes(f.name) && f.name !== 'NotificationFeed.tsx')
    .filter(f =>
      /styles\.(header|subHeader),\s*\{[^}]*paddingTop: insets\.top/.test(f.src),
    )
    .map(f => f.name);

  expect(offenders).toEqual([]);
});

test('the shared header components leave the inset to the shell', () => {
  for (const name of ['AppHeader.tsx', 'ScreenHeader.tsx']) {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'components', name),
      'utf8',
    );
    expect(src).not.toContain('useSafeAreaInsets');
  }
});

test("WebShell keeps the top edge that clears the status bar for everyone", () => {
  const src = fs.readFileSync(
    path.join(SCREENS, 'WebShell.tsx'),
    'utf8',
  );
  expect(src).toContain("edges={['top', 'right', 'bottom', 'left']}");
});

test('outside-shell pinned footers clear the home indicator themselves', () => {
  /**
   * Same one-owner rule as the headers above, applied to the bottom edge.
   *
   * A screen rendered inside WebShell sits in its SafeAreaView, which already
   * reserves the bottom inset, so its pinned bar must NOT add insets.bottom --
   * doing both left a visible gap under the bar (the creator profile's "Send
   * Message" button floated above the bottom of the screen).
   *
   * The screens listed in SELF_PADDED render outside that SafeAreaView, so
   * nothing reserves the inset for them and their own bar has to.
   *
   * Only bars that actually sit on the screen edge count: those are declared
   * with their own opaque background. A `footer` that is merely a row inside a
   * card (BrandCampaigns) sits in the scroll flow and needs no inset.
   */
  const isPinnedBar = (src: string, name: string) => {
    // Line scanning rather than a built RegExp: the escaping needed to express
    // this as a pattern is exactly the kind that silently degrades into
    // something that matches nothing, and a matcher that matches nothing makes
    // this whole test pass while checking nothing.
    // trimEnd: some screens are stored with CRLF, so a split on the
    // newline alone leaves a carriage return that breaks exact matching.
    const lines = src.split('\n').map(line => line.trimEnd());
    const open = lines.indexOf('  ' + name + ': {');
    if (open === -1) return false;
    const close = lines.indexOf('  },', open);
    return (
      close !== -1 &&
      lines.slice(open, close).some(line => line.includes('backgroundColor'))
    );
  };

  const hasPinnedFooter = (f: ScreenFile) =>
    ['footer', 'detailFooter'].some(
      n => f.src.includes('styles.' + n + ',') && isPinnedBar(f.src, n),
    );

  // Guard against a silently-broken matcher: these two screens really do pin a
  // bar to the bottom edge, so an empty result means the checks stopped
  // working rather than that every screen is compliant.
  const pinned = files
    .filter((f: ScreenFile) => SELF_PADDED.includes(f.name))
    .filter(hasPinnedFooter)
    .map((f: ScreenFile) => f.name);
  expect(pinned).toEqual(
    expect.arrayContaining(['BrandProfileSetup.tsx', 'CreatorProfileSetup.tsx']),
  );

  const offenders = files
    .filter((f: ScreenFile) => SELF_PADDED.includes(f.name))
    .filter(hasPinnedFooter)
    .filter((f: ScreenFile) => !/insets\.bottom/.test(f.src))
    .map((f: ScreenFile) => f.name);

  expect(offenders).toEqual([]);
});
