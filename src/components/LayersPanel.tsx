import React, { useState } from 'react';
import { EditorLayer, EditorState } from '../types';
import { cn } from '../lib/utils';
import { cloneLayersDeep, createEditorLayer, getNextLayerName } from '../lib/layers';
import { Eye, EyeOff, GripVertical, Lock, LockOpen, Plus, Trash2 } from 'lucide-react';

/** 패널은 위=전경(역순). dragId를 targetId 앞/뒤에 넣은 뒤 layers(아래→위)로 환산 */
function buildLayersAfterDrop(
  layers: readonly EditorLayer[],
  dragId: string,
  targetId: string,
  placeAfter: boolean,
): EditorLayer[] {
  if (dragId === targetId) return [...layers];
  const ordered = [...layers].reverse();
  const dragged = ordered.find(l => l.id === dragId);
  if (!dragged) return [...layers];
  const rest = ordered.filter(l => l.id !== dragId);
  const tIdx = rest.findIndex(l => l.id === targetId);
  if (tIdx < 0) return [...layers];
  const insertAt = placeAfter ? tIdx + 1 : tIdx;
  const nextOrdered = [...rest.slice(0, insertAt), dragged, ...rest.slice(insertAt)];
  return nextOrdered.reverse();
}

interface LayersPanelProps {
  state: EditorState;
  setState: React.Dispatch<React.SetStateAction<EditorState>>;
  /** 레이어 순서 등 변경 시 실행 취소용 스냅샷 */
  onLayersMutation?: (beforeLayers: EditorLayer[], beforeActiveLayerId: string, label?: string) => void;
}

/** 위쪽이 전경(상단 레이어)처럼 보이도록 역순 표시 */
export const LayersPanel: React.FC<LayersPanelProps> = ({ state, setState, onLayersMutation }) => {
  const ordered = [...state.layers].reverse();
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [dropIndicator, setDropIndicator] = useState<{ targetId: string; placeAfter: boolean } | null>(
    null,
  );

  const addLayer = () => {
    setState(prev => {
      const L = createEditorLayer(getNextLayerName(prev.layers));
      return {
        ...prev,
        layers: [...prev.layers, L],
        activeLayerId: L.id,
        selectedShapeIds: [],
        selectedRasterLayerId: null,
      };
    });
  };

  const deleteLayer = (layerId: string) => {
    if (state.layers.length <= 1) return;
    setState(prev => {
      const idx = prev.layers.findIndex(l => l.id === layerId);
      const next = prev.layers.filter(l => l.id !== layerId);
      let aid = prev.activeLayerId;
      if (aid === layerId) {
        const fallback = next[Math.max(0, idx - 1)] ?? next[0];
        aid = fallback.id;
      }
      return {
        ...prev,
        layers: next,
        activeLayerId: aid,
        selectedShapeIds: [],
        selectedRasterLayerId:
          prev.selectedRasterLayerId === layerId ? null : prev.selectedRasterLayerId,
      };
    });
  };

  const toggleVisible = (layerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setState(prev => ({
      ...prev,
      layers: prev.layers.map(l => (l.id === layerId ? { ...l, visible: !l.visible } : l)),
    }));
  };

  const toggleLocked = (layerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setState(prev => ({
      ...prev,
      layers: prev.layers.map(l => (l.id === layerId ? { ...l, locked: !l.locked } : l)),
    }));
  };

  const beginRename = (layerId: string, currentName: string) => {
    setEditingLayerId(layerId);
    setEditingName(currentName);
  };

  const commitRename = () => {
    if (!editingLayerId) return;
    const nextName = editingName.trim();
    if (nextName.length > 0) {
      setState(prev => ({
        ...prev,
        layers: prev.layers.map(l => (l.id === editingLayerId ? { ...l, name: nextName } : l)),
      }));
    }
    setEditingLayerId(null);
    setEditingName('');
  };

  const cancelRename = () => {
    setEditingLayerId(null);
    setEditingName('');
  };

  const clearDropIndicator = () => setDropIndicator(null);

  const handleRowDragOver = (e: React.DragEvent, layerId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const placeAfter = e.clientY > rect.top + rect.height / 2;
    setDropIndicator({ targetId: layerId, placeAfter });
  };

  const handleRowDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    clearDropIndicator();
    const dragId = e.dataTransfer.getData('text/plain');
    if (!dragId || dragId === targetId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const placeAfter = e.clientY > rect.top + rect.height / 2;
    const nextLayers = buildLayersAfterDrop(state.layers, dragId, targetId, placeAfter);
    const unchanged = nextLayers.every((l, i) => l.id === state.layers[i].id);
    if (unchanged) return;
    onLayersMutation?.(cloneLayersDeep(state.layers), state.activeLayerId, '레이어 순서');
    setState(prev => ({ ...prev, layers: nextLayers }));
  };

  return (
    <aside className="w-52 shrink-0 border-l border-neutral-800 bg-neutral-900/90 flex flex-col min-h-0">
      <div className="px-2 py-2 border-b border-neutral-800 flex items-center justify-between gap-1">
        <span className="text-xs font-semibold text-neutral-300">레이어</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={addLayer}
            title="레이어 추가"
            className="flex items-center justify-center rounded border border-neutral-700 bg-neutral-950 p-1 text-neutral-200 hover:bg-neutral-800"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            disabled={state.layers.length <= 1}
            onClick={() => {
              const cur = state.layers.find(l => l.id === state.activeLayerId);
              if (cur) deleteLayer(cur.id);
            }}
            title="활성 레이어 삭제"
            className="flex items-center justify-center rounded border border-neutral-700 bg-neutral-950 p-1 text-neutral-200 hover:bg-red-950/40 hover:border-red-800 disabled:opacity-30 disabled:hover:bg-neutral-950"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div
        className="flex-1 overflow-y-auto p-1 space-y-0.5 min-h-0"
        onDragLeave={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) clearDropIndicator();
        }}
      >
        {ordered.map(layer => (
          <div
            key={layer.id}
            role="button"
            tabIndex={0}
            onDragOver={e => handleRowDragOver(e, layer.id)}
            onDrop={e => handleRowDrop(e, layer.id)}
            onClick={() =>
              setState(s => ({
                ...s,
                activeLayerId: layer.id,
                selectedShapeIds: [],
                selectedRasterLayerId: null,
              }))
            }
            onDoubleClick={() => beginRename(layer.id, layer.name)}
            onKeyDown={e => {
              if (editingLayerId === layer.id) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setState(s => ({
                  ...s,
                  activeLayerId: layer.id,
                  selectedShapeIds: [],
                  selectedRasterLayerId: null,
                }));
              }
            }}
            className={cn(
              'w-full flex items-center gap-1 rounded px-1 py-1 text-left text-[11px] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              layer.id === state.activeLayerId
                ? 'bg-blue-900/40 text-neutral-100 ring-1 ring-blue-500/40'
                : 'text-neutral-300 hover:bg-neutral-800/80',
              dropIndicator?.targetId === layer.id &&
                !dropIndicator.placeAfter &&
                'border-t-2 border-amber-400',
              dropIndicator?.targetId === layer.id &&
                dropIndicator.placeAfter &&
                'border-b-2 border-amber-400'
            )}
          >
            <span
              draggable
              title="끌어서 레이어 순서 변경 (위쪽이 전경)"
              className="p-0.5 shrink-0 rounded text-neutral-500 hover:text-neutral-200 cursor-grab active:cursor-grabbing touch-none"
              onClick={e => e.stopPropagation()}
              onDragStart={e => {
                e.stopPropagation();
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', layer.id);
              }}
              onDragEnd={clearDropIndicator}
            >
              <GripVertical size={14} aria-hidden />
            </span>
            <button
              type="button"
              className="p-0.5 shrink-0 rounded text-neutral-400 hover:text-neutral-200"
              title={layer.visible ? '숨기기' : '표시'}
              onClick={e => toggleVisible(layer.id, e)}
            >
              {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            <button
              type="button"
              className="p-0.5 shrink-0 rounded text-neutral-400 hover:text-neutral-200"
              title={layer.locked ? '잠금 해제' : '잠금'}
              onClick={e => toggleLocked(layer.id, e)}
            >
              {layer.locked ? <Lock size={13} /> : <LockOpen size={13} />}
            </button>
            {editingLayerId === layer.id ? (
              <input
                autoFocus
                value={editingName}
                onChange={e => setEditingName(e.target.value)}
                onBlur={commitRename}
                onClick={e => e.stopPropagation()}
                onDoubleClick={e => e.stopPropagation()}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitRename();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelRename();
                  }
                }}
                className="flex-1 min-w-0 h-5 rounded border border-blue-600/60 bg-neutral-950 px-1 text-[11px] text-neutral-100 outline-none"
                title="레이어 이름 변경"
                maxLength={40}
              />
            ) : (
              <span
                className="flex-1 min-w-0 truncate"
                title={`${layer.name} (더블클릭하여 이름 변경)`}
              >
                {layer.name}
              </span>
            )}
            <span className="text-[10px] text-neutral-500 tabular-nums shrink-0">{layer.shapes.length}</span>
          </div>
        ))}
      </div>
    </aside>
  );
};
