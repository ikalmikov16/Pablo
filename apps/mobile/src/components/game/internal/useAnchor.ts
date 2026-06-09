/**
 * Registers a View's screen-space bounds as a flight animation anchor.
 */

import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';

import { registerAnchor, unregisterAnchor } from '../../../store/anchorRegistry';
import type { AnchorId } from '../../../store/flightTypes';

export function useAnchor(id: AnchorId) {
  const ref = useRef<View>(null);
  const idRef = useRef(id);
  idRef.current = id;

  const measure = useCallback(() => {
    const view = ref.current;
    if (!view) return;
    view.measureInWindow((x, y, w, h) => {
      if (w <= 0 || h <= 0) return;
      registerAnchor(idRef.current, { x, y, w, h });
    });
  }, []);

  useEffect(() => {
    return () => {
      unregisterAnchor(idRef.current);
    };
  }, []);

  useEffect(() => {
    measure();
  }, [id, measure]);

  return { ref, onLayout: measure };
}
