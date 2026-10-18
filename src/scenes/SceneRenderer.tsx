import type { ComponentType } from 'react';

import type { VisualStyle } from '../style/types';
import { AmbientSceneSkia } from './AmbientSceneSkia';
import { DanceSceneSkia } from './DanceSceneSkia';
import { JazzSceneSkia } from './JazzSceneSkia';
import { PopSceneSkia } from './PopSceneSkia';
import { RockSceneSkia } from './RockSceneSkia';
import type { SceneProps } from './SceneProps';

// Skia shader scenes. The Animated/SVG originals (AmbientScene.tsx, JazzScene.tsx,
// PopScene.tsx, DanceScene.tsx, RockScene.tsx) stay in the tree for comparison.
//
// Each scene folds intensity / motion / accent into its own picture, so there
// is no shared overlay on top: the former AudioReactiveWave bars were a
// stopgap for the Animated scenes and clashed with the shader art.
const sceneByStyle: Record<VisualStyle, ComponentType<SceneProps>> = {
  ambient: AmbientSceneSkia,
  jazz: JazzSceneSkia,
  pop: PopSceneSkia,
  dance: DanceSceneSkia,
  rock: RockSceneSkia,
};

export function SceneRenderer(props: SceneProps) {
  const Scene = sceneByStyle[props.visual.style];

  return <Scene {...props} />;
}
