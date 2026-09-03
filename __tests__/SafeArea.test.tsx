/**
 * @format
 * Guards the iOS safe-area contract at the source level.
 *
 * On Android the status bar sits above the app, so a header with plain padding
 * looked correct and these bugs stayed invisible. iOS draws under the clock and
 * the home indicator, where the same code put titles behind the status bar and
 * pinned buttons under the gesture bar.
 *
 * These are source assertions rather than render assertions on purpose: the bug
 * class is "a screen forgot the inset entirely", which only a sweep over every
 * screen can catch. A rendered test would need all 42 screens mounted with
 * their own fixtures.
 */
// @types/node is not a dependency of this app, so the few Node globals this
// source-level test needs are declared here rather than pulling in the package.
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

const SCREENS = path.join(__dirname, '..', 'src', 'screens');

type ScreenFile = { name: string; src: string };

const files: ScreenFile[] = fs
  .readdirSync(SCREENS)
  .filter((name: string) => name.endsWith('.tsx'))
  .map((name: string) => ({
    name,
    src: fs.readFileSync(path.join(SCREENS, name), 'utf8') as string,
  }));

test('every screen header clears the status bar', () => {
  // A bar rendered as `styles.header` / `styles.subHeader` is the first thing
  // under the status bar. It has to add insets.top, or its title collides with
  // the clock and battery on iOS.
  const offenders = files
    .filter((f: ScreenFile) => /style=\{\[?styles\.(header|subHeader)[,}]/.test(f.src))
    .filter((f: ScreenFile) => !/styles\.(header|subHeader),\s*\{[^}]*paddingTop: insets\.top/.test(f.src))
    .map((f: ScreenFile) => f.name);

  expect(offenders).toEqual([]);
});

test('screen-pinned footers clear the home indicator', () => {
  /**
   * Only bars that actually sit on the screen edge matter here. Those are
   * declared with their own opaque background and a top rule — that is what
   * makes them read as a bar over the content behind them. A `footer` that is
   * merely a row inside a card (BrandCampaigns) has neither, sits in the scroll
   * flow, and needs no inset.
   */
  const isPinnedBar = (src: string, name: string) => {
    const block = src.match(
      new RegExp('^  ' + name + ': \\{[\\s\\S]*?^  \\},', 'm'),
    );
    return !!block && /backgroundColor/.test(block[0]);
  };

  const offenders = files
    .filter((f: ScreenFile) =>
      ['footer', 'detailFooter'].some(
        n =>
          new RegExp('<View style=\\{\\[?styles\\.' + n + '[,}]').test(f.src) &&
          isPinnedBar(f.src, n),
      ),
    )
    .filter((f: ScreenFile) => !/insets\.bottom/.test(f.src))
    .map((f: ScreenFile) => f.name);

  expect(offenders).toEqual([]);
});

test('the shared header components apply the top inset themselves', () => {
  // 19 screens rely on these two rather than rolling their own bar, so the
  // inset belongs inside them.
  for (const name of ['AppHeader.tsx', 'ScreenHeader.tsx']) {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'components', name),
      'utf8',
    );
    expect(src).toContain('useSafeAreaInsets');
    expect(src).toContain('insets.top');
  }
});
