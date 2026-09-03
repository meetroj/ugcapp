/**
 * Launch screen shown while the stored session is read back and checked.
 *
 * Just the artwork — no text, no spinner. It is a full-bleed portrait image, so
 * it is drawn edge to edge with `cover`: filling the screen on every aspect
 * ratio and cropping the overflow rather than letterboxing it.
 */
import React from 'react';
import { Image, StatusBar, StyleSheet, View } from 'react-native';

/** Sampled from the top edge of the artwork, so any gap is invisible. */
const SPLASH_BACKGROUND = '#0A0A47';

function SplashScreen(): React.JSX.Element {
  return (
    <View style={styles.root}>
      {/* Light glyphs: the artwork is dark navy behind the status bar. */}
      <StatusBar barStyle="light-content" />

      <Image
        source={require('../../assests/splash/spalsh.png')}
        style={styles.image}
        resizeMode="cover"
        // Decorative only — nothing here for a screen reader to announce.
        accessible={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SPLASH_BACKGROUND },
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
});

export default SplashScreen;
