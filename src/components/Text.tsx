/**
 * App-wide Text / TextInput wrappers that clamp OS font scaling.
 *
 * The app honours the user's system font-size preference — but capped at
 * `MAX_FONT_SCALE`. Uncapped, the largest accessibility settings (up to 3.1x on
 * iOS) overflow the fixed-height headers, badges, chips and table rows this
 * layout is built from; text would clip rather than reflow.
 *
 * React Native applies `maxFontSizeMultiplier` per Text element, so there is no
 * global setting to flip — every text node needs the prop. Rather than repeat it
 * ~1,500 times, screens import `Text` from here instead of from `react-native`
 * and get the cap for free. The props are otherwise identical, so the swap is a
 * one-line import change per file.
 *
 * A caller can still opt out or tighten it by passing its own
 * `maxFontSizeMultiplier` — an explicit prop wins over the default.
 */
import React from 'react';
import {
  Text as RNText,
  TextInput as RNTextInput,
  type TextProps,
  type TextInputProps,
} from 'react-native';
import { MAX_FONT_SCALE } from '../theme';

export function Text({ maxFontSizeMultiplier, ...rest }: TextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_FONT_SCALE}
      {...rest}
    />
  );
}

export function TextInput({ maxFontSizeMultiplier, ...rest }: TextInputProps) {
  return (
    <RNTextInput
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_FONT_SCALE}
      {...rest}
    />
  );
}

export default Text;
