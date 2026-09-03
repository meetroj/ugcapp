/**
 * react-native-video touches native playback on import, which never resolves
 * under the test renderer. Stand in a plain View so screens that embed a
 * player still render; playback callbacks simply never fire.
 */
import React from 'react';
import {View} from 'react-native';

const Video = React.forwardRef((props: any, ref: any) => (
  <View ref={ref} {...props} />
));

export default Video;
