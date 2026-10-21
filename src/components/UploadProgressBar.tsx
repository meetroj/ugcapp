/** Thin progress bar for file uploads. `percent` is 0-100, or null to hide it. */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Text} from './Text';
import {fontScale, scale} from '../theme';

export default function UploadProgressBar({
  percent,
  color = '#6366F1',
}: {
  percent: number | null;
  color?: string;
}) {
  if (percent == null) return null;
  // A stray 104% or NaN must never overflow or collapse the bar.
  const pct = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0));
  return (
    <View
      style={styles.wrap}
      accessibilityRole="progressbar"
      accessibilityValue={{min: 0, max: 100, now: pct}}
    >
      <View style={styles.track}>
        <View style={[styles.fill, {width: `${pct}%`, backgroundColor: color}]} />
      </View>
      <Text style={styles.label}>
        {pct >= 100 ? 'Processing…' : `Uploading ${Math.round(pct)}%`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {width: '100%', marginTop: scale(10)},
  track: {
    height: scale(8),
    borderRadius: scale(4),
    backgroundColor: 'rgba(127,127,160,0.25)',
    overflow: 'hidden',
  },
  fill: {height: '100%', borderRadius: scale(4)},
  label: {marginTop: scale(4), fontSize: fontScale(13), color: '#5C6180'},
});
