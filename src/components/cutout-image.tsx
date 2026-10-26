/**
 * A piece cut out of its photo and set on a plain neutral background, turned to a consistent angle with a soft shadow
 * beneath. Drawn from the photo and its stored outline each time (see lib/cutout.ts), so nothing is baked in.
 */
import { memo, useMemo } from 'react';
import { View } from 'react-native';
import Svg, { ClipPath, Defs, Ellipse, G, Image as SvgImage, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { CUTOUT_BGS, cutoutLayout, type Cutout, type CutoutBg, type CutoutLook } from '@/lib/cutout';

let counter = 0;

export const CutoutImage = memo(function CutoutImage({ uri, cutout, size, look, bg }: { uri: string; cutout: Cutout; size: number; look: CutoutLook; bg: CutoutBg }) {
  const id = useMemo(() => `cut${(counter += 1)}`, []);
  const layout = useMemo(() => cutoutLayout(cutout, 100, look), [cutout, look]);
  const colors = CUTOUT_BGS[bg];
  // The layout is worked out in a 100-unit square and scaled to the size asked for.
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, overflow: 'hidden', backgroundColor: colors.fill }} accessibilityIgnoresInvertColors>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <ClipPath id={`${id}c`}>
            <Path d={layout.clip} />
          </ClipPath>
          <RadialGradient id={`${id}s`} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={colors.shadow} stopOpacity={0.32} />
            <Stop offset="1" stopColor={colors.shadow} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill={colors.fill} />
        <Ellipse cx={layout.shadow.cx} cy={layout.shadow.cy} rx={layout.shadow.rx} ry={layout.shadow.ry} fill={`url(#${id}s)`} />
        <G transform={layout.transform}>
          <SvgImage href={{ uri }} x={0} y={0} width={100} height={100} preserveAspectRatio="none" clipPath={`url(#${id}c)`} />
        </G>
      </Svg>
    </View>
  );
});
