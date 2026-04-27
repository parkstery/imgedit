import React, { useMemo } from 'react';
import { EditorState } from '../types';
import { boundingRectOfSelectionCircle } from '../lib/documentCapture';
import { documentHasRaster, findShapeInLayers, getActiveLayer, getDocumentCanvasSize, getRasterDocWorldAabb } from '../lib/layers';
import { getShapeWorldAabb, unionRects } from '../lib/shapeGeometry';

interface StatusBarProps {
  state: EditorState;
}

/** 선택 도형·래스터의 문서 좌표 바운드 (점선 선택과 동일 형식용) */
function usePickBounds(state: EditorState): { x: number; y: number; w: number; h: number } | null {
  return useMemo(() => {
    if (state.selectedRasterLayerId && state.selectedShapeIds.length === 0) {
      const lyr = state.layers.find(l => l.id === state.selectedRasterLayerId);
      if (!lyr?.image) return null;
      const box = getRasterDocWorldAabb(lyr);
      if (!box) return null;
      return { x: box.x, y: box.y, w: box.width, h: box.height };
    }
    if (state.selectedShapeIds.length > 0) {
      const shapes = state.selectedShapeIds
        .map(id => findShapeInLayers(state.layers, id))
        .filter((s): s is NonNullable<typeof s> => s != null);
      if (shapes.length === 0) return null;
      let acc: ReturnType<typeof getShapeWorldAabb> = null;
      for (const sh of shapes) {
        const b = getShapeWorldAabb(sh);
        if (!b) continue;
        acc = acc ? unionRects(acc, b) : b;
      }
      if (!acc) return null;
      return { x: acc.x, y: acc.y, w: acc.width, h: acc.height };
    }
    return null;
  }, [state.layers, state.selectedRasterLayerId, state.selectedShapeIds]);
}

export const StatusBar: React.FC<StatusBarProps> = ({ state }) => {
  const active = getActiveLayer(state.layers, state.activeLayerId);
  const { width: dw, height: dh } = getDocumentCanvasSize(state.layers);
  const pickBounds = usePickBounds(state);
  const marqueeRectDisplay =
    state.selection && state.selection.width >= 2 && state.selection.height >= 2
      ? state.selection
      : state.selectionCircle && state.selectionCircle.r >= 1
        ? boundingRectOfSelectionCircle(state.selectionCircle)
        : null;

  return (
    <div className="h-8 bg-neutral-800 border-t border-neutral-700 flex items-center px-4 text-[11px] text-neutral-400 gap-4 sm:gap-6 shrink-0 font-mono overflow-x-auto no-scrollbar">
      <div className="flex items-center gap-2 truncate max-w-[100px] sm:max-w-none">
        <span className="opacity-50 uppercase hidden sm:inline">File:</span>
        <span className="text-neutral-200 truncate">{active?.fileName || 'None'}</span>
      </div>

      {documentHasRaster(state.layers) && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="opacity-50 uppercase hidden sm:inline">Size:</span>
          <span className="text-neutral-200">
            {dw} × {dh}
          </span>
        </div>
      )}

      {marqueeRectDisplay && (
        <div className="hidden md:flex items-center gap-2 border-l border-neutral-700 pl-6 shrink-0">
          <span className="opacity-50 uppercase text-blue-400">Selection:</span>
          <span className="text-neutral-200">
            {Math.round(marqueeRectDisplay.x)}, {Math.round(marqueeRectDisplay.y)} (
            {Math.round(marqueeRectDisplay.width)} × {Math.round(marqueeRectDisplay.height)})
            {state.selectionCircle && (
              <span className="text-neutral-500 ml-1">(원 r≈{Math.round(state.selectionCircle.r)})</span>
            )}
          </span>
        </div>
      )}

      {pickBounds && (
        <div className="hidden md:flex items-center gap-2 border-l border-neutral-700 pl-6 shrink-0">
          <span className="opacity-50 text-sky-400">개체:</span>
          <span className="text-neutral-200">
            {Math.round(pickBounds.x)}, {Math.round(pickBounds.y)} ({Math.round(pickBounds.w)} ×{' '}
            {Math.round(pickBounds.h)})
          </span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className="opacity-50 uppercase hidden sm:inline">Zoom:</span>
          <span className="text-neutral-200">{(state.zoom * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
};
