import type { LineDirection, SongDirection } from '../../direction/types';
import { DEFAULT_PALETTE } from '../../direction/types';
import type { IdleTrack } from '../../typesetting/idleComposition';

/**
 * A fictional song (lyrics written for this app, not a real work) so the lyric
 * stage can be evaluated in Expo Go without a recognized track.
 */
export const FIXTURE_LRC = `[00:02.00]夜明け前の街
[00:06.00]錆びた信号機が瞬く
[00:10.00]叫べ
[00:13.00]Hold me in the static
[00:17.00]硝子の雨、無言の鼓動
[00:21.00]
[00:24.00]追いかけて、追いかけて
[00:28.00]灰色の空を裂く光
[00:32.00]轟け
[00:35.00]失われた記憶の断片
[00:39.00]孤独な夜を越えて
[00:43.00]
[00:46.00]追いかけて、追いかけて
[00:50.00]暁の鐘が鳴り響く
[00:54.00]鼓動
[00:57.00]絶望も希望も飲み込んで
[01:01.00]彼方へ続く旅路
[01:05.00]運命の扉を開け
[01:09.00]夜明けの街で目覚める
[01:13.00]終わらない朝
`;

export const FIXTURE_TRACK: IdleTrack = { title: '仮題', artist: 'MUSICAGE' };

type Spec = Pick<LineDirection, 'font' | 'size' | 'orientation' | 'entrance' | 'hold'> &
  Partial<Pick<LineDirection, 'emphasis' | 'accent' | 'weight'>>;

const line = (spec: Spec): LineDirection => ({
  weight: 'regular',
  emphasis: [],
  accent: false,
  ornament: 'none',
  ...spec,
});

const EMPTY_LINE = line({
  font: 'mincho',
  size: 'xs',
  orientation: 'horizontal',
  entrance: 'fade',
  hold: 'still',
});

export const FIXTURE_DIRECTION: SongDirection = {
  palette: DEFAULT_PALETTE,
  texture: 'grain',
  tempoFeel: 'sway',
  idleGlyphs: '夜明暁鼓動0123○△□',
  lines: [
    line({ font: 'mincho', size: 'l', orientation: 'vertical', entrance: 'trace', hold: 'still' }),
    line({
      font: 'mincho',
      weight: 'light',
      size: 'm',
      orientation: 'horizontal',
      entrance: 'fade',
      hold: 'breathe',
      emphasis: [0],
    }),
    line({
      font: 'gothic-heavy',
      weight: 'bold',
      size: 'xl',
      orientation: 'horizontal',
      entrance: 'cut',
      hold: 'shake',
      accent: true,
    }),
    line({
      font: 'gothic-heavy',
      size: 's',
      orientation: 'horizontal',
      entrance: 'rise',
      hold: 'drift',
    }),
    line({
      font: 'mincho',
      weight: 'bold',
      size: 'l',
      orientation: 'vertical',
      entrance: 'drop',
      hold: 'pulse',
      emphasis: [0, 5],
    }),
    EMPTY_LINE,
    line({
      font: 'gothic-heavy',
      weight: 'bold',
      size: 'm',
      orientation: 'horizontal',
      entrance: 'scatter',
      hold: 'pulse',
    }),
    line({
      font: 'mincho',
      size: 'l',
      orientation: 'vertical',
      entrance: 'rise',
      hold: 'drift',
      emphasis: [3],
    }),
    line({
      font: 'gothic-heavy',
      weight: 'bold',
      size: 'xl',
      orientation: 'vertical',
      entrance: 'drop',
      hold: 'shake',
      accent: true,
    }),
    line({
      font: 'mincho',
      weight: 'light',
      size: 'm',
      orientation: 'vertical',
      entrance: 'trace',
      hold: 'breathe',
    }),
    line({
      font: 'mincho',
      size: 'm',
      orientation: 'horizontal',
      entrance: 'fade',
      hold: 'still',
    }),
    EMPTY_LINE,
    line({
      font: 'gothic-heavy',
      weight: 'bold',
      size: 'l',
      orientation: 'horizontal',
      entrance: 'cut',
      hold: 'pulse',
      accent: true,
    }),
    line({
      font: 'mincho',
      weight: 'bold',
      size: 'l',
      orientation: 'vertical',
      entrance: 'scatter',
      hold: 'drift',
      emphasis: [0],
    }),
    line({
      font: 'gothic-heavy',
      weight: 'bold',
      size: 'xl',
      orientation: 'vertical',
      entrance: 'rise',
      hold: 'breathe',
      accent: true,
    }),
    line({
      font: 'mincho',
      size: 'm',
      orientation: 'horizontal',
      entrance: 'trace',
      hold: 'still',
      emphasis: [0, 3],
    }),
    line({
      font: 'mincho',
      weight: 'light',
      size: 'm',
      orientation: 'vertical',
      entrance: 'fade',
      hold: 'breathe',
    }),
    line({
      font: 'gothic-heavy',
      weight: 'bold',
      size: 'l',
      orientation: 'horizontal',
      entrance: 'cut',
      hold: 'pulse',
    }),
    line({ font: 'mincho', size: 'l', orientation: 'vertical', entrance: 'rise', hold: 'drift' }),
    line({
      font: 'mincho',
      weight: 'bold',
      size: 'l',
      orientation: 'vertical',
      entrance: 'fade',
      hold: 'still',
      emphasis: [0],
    }),
  ],
};
