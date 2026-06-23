/**
 * Full-bleed felt background — radial green gradient with a soft edge vignette.
 * Static Skia scene; no game-state subscriptions.
 */

import { memo, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Canvas, RadialGradient, Rect, vec } from '@shopify/react-native-skia';

import { tokens } from '../../design/tokens';

type Size = { readonly w: number; readonly h: number };

function TableBackgroundComponent() {
  const [size, setSize] = useState<Size | null>(null);

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    setSize((prev) => (prev?.w === width && prev?.h === height ? prev : { w: width, h: height }));
  }

  const scene = useMemo(() => {
    if (!size) return null;
    const { w, h } = size;
    const cx = w / 2;
    const cy = h * 0.42;
    const radius = 0.75 * Math.hypot(w, h);
    return {
      w,
      h,
      cx,
      cy,
      radius,
      table: tokens.game.surface.table,
      edge: tokens.game.surface.tableEdge,
    };
  }, [size]);

  return (
    <View style={StyleSheet.absoluteFillObject} onLayout={onLayout} pointerEvents="none">
      {scene && (
        <Canvas style={StyleSheet.absoluteFillObject}>
          <Rect x={0} y={0} width={scene.w} height={scene.h}>
            <RadialGradient
              c={vec(scene.cx, scene.cy)}
              r={scene.radius}
              colors={[scene.table, scene.edge]}
            />
          </Rect>

          <Rect x={0} y={0} width={scene.w} height={scene.h}>
            <RadialGradient
              c={vec(scene.cx, scene.cy)}
              r={scene.radius}
              colors={['transparent', 'transparent', scene.edge]}
              positions={[0, 0.65, 1]}
            />
          </Rect>
        </Canvas>
      )}
    </View>
  );
}

export const TableBackground = memo(TableBackgroundComponent);
