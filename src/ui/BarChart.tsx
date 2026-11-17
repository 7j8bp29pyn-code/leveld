import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { colors, font } from './theme';

export interface Bar {
  label: string;
  /** null = missing data → rendered as a dashed gap marker, never as 0 */
  value: number | null;
}

/** Minimal, readable bar chart. Missing values are visibly distinct from zero. */
export function BarChart({ bars, height = 140, max, labelEvery = 1, testID }: { bars: Bar[]; height?: number; max?: number; labelEvery?: number; testID?: string }) {
  const [width, setWidth] = React.useState(0);
  const top = max ?? Math.max(1, ...bars.map((b) => b.value ?? 0));
  const gap = bars.length > 20 ? 2 : 6;
  const bw = bars.length ? Math.max(2, (width - gap * (bars.length - 1)) / bars.length) : 0;
  return (
    <View testID={testID} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Svg width={width} height={height}>
        <Line x1={0} x2={width} y1={height - 1} y2={height - 1} stroke={colors.border} strokeWidth={1} />
        {bars.map((b, i) => {
          const x = i * (bw + gap);
          if (b.value === null) {
            return <Line key={i} x1={x + bw / 2} x2={x + bw / 2} y1={height - 18} y2={height - 2} stroke={colors.textFaint} strokeDasharray="2,3" strokeWidth={1} />;
          }
          const h = Math.max(b.value > 0 ? 3 : 1, ((height - 4) * b.value) / top);
          return <Rect key={i} x={x} y={height - h - 1} width={bw} height={h} rx={Math.min(3, bw / 2)} fill={b.value > 0 ? colors.accent : colors.border} />;
        })}
      </Svg>
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        {bars.map((b, i) => (
          <Text key={i} style={[font.small, { width: bw + (i < bars.length - 1 ? gap : 0), fontSize: 10, textAlign: 'center' }]} numberOfLines={1}>
            {i % labelEvery === 0 ? b.label : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}
