/**
 * Jest stand-in for react-native-webview.
 * The real module calls TurboModuleRegistry.getEnforcing at import time, which
 * throws outside a native runtime, so tests render an inert View instead.
 */
import React from 'react';
import {View, type ViewProps} from 'react-native';

/** Accepts (and ignores) the ref and webview-only props the app passes. */
export const WebView = React.forwardRef<
  React.ComponentRef<typeof View>,
  ViewProps & Record<string, unknown>
>((_props, ref) => <View ref={ref} testID="mock-webview" />);

WebView.displayName = 'WebView';

export default WebView;
