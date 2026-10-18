import type { ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';

import type { VisualStyle } from '../style/types';
import { AmbientSceneSkia } from './AmbientSceneSkia';
import { AudioReactiveWave } from './AudioReactiveWave';
import { DanceScene } from './DanceScene';
import { JazzScene } from './JazzScene';
import { PopScene } from './PopScene';
import { RockScene } from './RockScene';
import type { SceneProps } from './SceneProps';

const sceneByStyle: Record<VisualStyle, ComponentType<SceneProps>> = {
  // Skia shader rebuild; the Animated/SVG version stays in AmbientScene.tsx for comparison.
  ambient: AmbientSceneSkia,
  jazz: JazzScene,
  pop: PopScene,
  dance: DanceScene,
  rock: RockScene,
};

export function SceneRenderer(props: SceneProps) {
  const Scene = sceneByStyle[props.visual.style];

  return (
    <View style={styles.root}>
      <Scene {...props} />
      <AudioReactiveWave reducedMotion={props.reducedMotion} visual={props.visual} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
