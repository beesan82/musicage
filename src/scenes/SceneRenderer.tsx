import type { ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';

import type { VisualStyle } from '../style/types';
import { AmbientSceneSkia } from './AmbientSceneSkia';
import { AudioReactiveWave } from './AudioReactiveWave';
import { DanceSceneSkia } from './DanceSceneSkia';
import { JazzSceneSkia } from './JazzSceneSkia';
import { PopSceneSkia } from './PopSceneSkia';
import { RockSceneSkia } from './RockSceneSkia';
import type { SceneProps } from './SceneProps';

// Skia shader scenes. The Animated/SVG originals (AmbientScene.tsx, JazzScene.tsx,
// PopScene.tsx, DanceScene.tsx, RockScene.tsx) stay in the tree for comparison.
const sceneByStyle: Record<VisualStyle, ComponentType<SceneProps>> = {
  ambient: AmbientSceneSkia,
  jazz: JazzSceneSkia,
  pop: PopSceneSkia,
  dance: DanceSceneSkia,
  rock: RockSceneSkia,
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
