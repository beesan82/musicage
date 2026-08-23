import type { ComponentType } from 'react';

import type { VisualStyle } from '../style/types';
import { AmbientScene } from './AmbientScene';
import { DanceScene } from './DanceScene';
import { JazzScene } from './JazzScene';
import { PopScene } from './PopScene';
import { RockScene } from './RockScene';
import type { SceneProps } from './SceneProps';

const sceneByStyle: Record<VisualStyle, ComponentType<SceneProps>> = {
  ambient: AmbientScene,
  jazz: JazzScene,
  pop: PopScene,
  dance: DanceScene,
  rock: RockScene,
};

export function SceneRenderer(props: SceneProps) {
  const Scene = sceneByStyle[props.visual.style];

  return <Scene {...props} />;
}
