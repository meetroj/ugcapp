/**
 * Icon set drawn with real vector paths via react-native-svg.
 * Line icons follow a 24x24 grid with a 1.8 stroke, matching the weight used
 * across the auth screens.
 */
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors, scale } from '../theme';

const STROKE = colors.placeholder;

type IconProps = { color?: string; size?: number };

/** Envelope. */
export function MailIcon({ color = STROKE, size = 20 }: IconProps) {
  return (
    <Svg width={scale(size)} height={scale(size)} viewBox="0 0 24 24" fill="none">
      <Rect
        x={2.5}
        y={5}
        width={19}
        height={14}
        rx={2.5}
        stroke={color}
        strokeWidth={1.8}
      />
      <Path
        d="M3 7.5l7.6 5.3a2.5 2.5 0 0 0 2.8 0L21 7.5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Padlock, shackle closed. */
export function LockIcon({ color = STROKE, size = 20 }: IconProps) {
  return (
    <Svg width={scale(size)} height={scale(size)} viewBox="0 0 24 24" fill="none">
      <Rect
        x={4}
        y={10.5}
        width={16}
        height={10.5}
        rx={2.5}
        stroke={color}
        strokeWidth={1.8}
      />
      <Path
        d="M7.75 10.5V7.75a4.25 4.25 0 1 1 8.5 0v2.75"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Eye; `crossed` adds the slash used for the "hide password" state. */
export function EyeIcon({
  color = STROKE,
  size = 20,
  crossed = false,
}: IconProps & { crossed?: boolean }) {
  return (
    <Svg width={scale(size)} height={scale(size)} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.8} />
      {crossed && (
        <Path
          d="M4 20 20 4"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
}

/** Head and shoulders, for the Creator role chip. */
export function PersonIcon({ color = STROKE, size = 18 }: IconProps) {
  return (
    <Svg width={scale(size)} height={scale(size)} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={3.75} stroke={color} strokeWidth={1.8} />
      <Path
        d="M4.5 20.25a7.5 7.5 0 0 1 15 0"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Office block, for the Brand role chip. */
export function BuildingIcon({ color = STROKE, size = 18 }: IconProps) {
  return (
    <Svg width={scale(size)} height={scale(size)} viewBox="0 0 24 24" fill="none">
      <Rect
        x={4}
        y={3}
        width={16}
        height={18}
        rx={2}
        stroke={color}
        strokeWidth={1.8}
      />
      <Path
        d="M9 7.5h1.5M13.5 7.5H15M9 12h1.5M13.5 12H15M10.5 21v-4h3v4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * The Google "G", using Google's own four brand path segments — the same
 * geometry as the official mark rather than an approximation.
 */
export function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={scale(size)} height={scale(size)} viewBox="0 0 48 48">
      <Path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <Path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <Path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <Path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </Svg>
  );
}
