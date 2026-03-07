import React from 'react';
import { EditorState } from '../types';

interface StatusBarProps {
  state: EditorState;
}

export const StatusBar: React.FC<StatusBarProps> = ({ state }) => {
  return (
    <div className="h-8 bg-neutral-800 border-t border-neutral-700 flex items-center px-4 text-[11px] text-neutral-400 gap-6 shrink-0 font-mono">
      <div className="flex items-center gap-2">
        <span className="opacity-50 uppercase">File:</span>
        <span className="text-neutral-200">{state.fileName || 'None'}</span>
      </div>
      
      {state.image && (
        <div className="flex items-center gap-2">
          <span className="opacity-50 uppercase">Size:</span>
          <span className="text-neutral-200">{state.image.width} × {state.image.height} px</span>
        </div>
      )}

      {state.selection && (
        <div className="flex items-center gap-2 border-l border-neutral-700 pl-6">
          <span className="opacity-50 uppercase text-blue-400">Selection:</span>
          <span className="text-neutral-200">
            {Math.round(state.selection.x)}, {Math.round(state.selection.y)} 
            {' '}({Math.round(state.selection.width)} × {Math.round(state.selection.height)})
          </span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="opacity-50 uppercase">Zoom:</span>
          <span className="text-neutral-200">{(state.zoom * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
};
