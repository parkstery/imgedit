import React, { useState, useEffect } from 'react';
import { X, Scale, Link, Link2Off } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';
import { formStyles } from './ui/formStyles';

interface ResizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResize: (width: number, height: number) => void;
  currentWidth: number;
  currentHeight: number;
}

export const ResizeModal: React.FC<ResizeModalProps> = ({ 
  isOpen, 
  onClose, 
  onResize, 
  currentWidth, 
  currentHeight 
}) => {
  const [width, setWidth] = useState(currentWidth);
  const [height, setHeight] = useState(currentHeight);
  const [lockAspectRatio, setLockAspectRatio] = useState(true);
  const [percentage, setPercentage] = useState(100);

  useEffect(() => {
    if (isOpen) {
      setWidth(currentWidth);
      setHeight(currentHeight);
      setPercentage(100);
    }
  }, [isOpen, currentWidth, currentHeight]);

  const handleWidthChange = (val: number) => {
    setWidth(val);
    if (lockAspectRatio) {
      setHeight(Math.round(val * (currentHeight / currentWidth)));
    }
    setPercentage(Math.round((val / currentWidth) * 100));
  };

  const handleHeightChange = (val: number) => {
    setHeight(val);
    if (lockAspectRatio) {
      setWidth(Math.round(val * (currentWidth / currentHeight)));
    }
    setPercentage(Math.round((val / currentHeight) * 100));
  };

  const handlePercentageChange = (pct: number) => {
    setPercentage(pct);
    const newWidth = Math.round(currentWidth * (pct / 100));
    const newHeight = Math.round(currentHeight * (pct / 100));
    setWidth(newWidth);
    setHeight(newHeight);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-sm bg-neutral-800 border border-neutral-700 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700">
              <h2 className="text-lg font-semibold text-neutral-100 flex items-center gap-2">
                <Scale size={20} className="text-blue-400" />
                이미지 크기 조절 (용량 줄이기)
              </h2>
              <Button onClick={onClose} variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                <X size={20} className="text-neutral-400" />
              </Button>
            </div>

            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider">비율 (%)</label>
                  <span className="text-xs text-blue-400 font-mono">{percentage}%</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="200"
                  value={percentage}
                  onChange={(e) => handlePercentageChange(parseInt(e.target.value))}
                  className={cn('w-full bg-neutral-900', formStyles.sliderBase)}
                />
                <div className="grid grid-cols-4 gap-2">
                  {[25, 50, 75, 100].map(pct => (
                    <Button
                      key={pct}
                      onClick={() => handlePercentageChange(pct)}
                      variant={percentage === pct ? 'primary' : 'secondary'}
                      size="sm"
                      className="h-6 rounded text-[10px]"
                    >
                      {pct}%
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 relative">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider">가로 (px)</label>
                  <input
                    type="number"
                    value={width}
                    onChange={(e) => handleWidthChange(parseInt(e.target.value) || 0)}
                    className={cn('w-full rounded-lg px-3 py-2 text-sm', formStyles.inputBase)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider">세로 (px)</label>
                  <input
                    type="number"
                    value={height}
                    onChange={(e) => handleHeightChange(parseInt(e.target.value) || 0)}
                    className={cn('w-full rounded-lg px-3 py-2 text-sm', formStyles.inputBase)}
                  />
                </div>
                <Button
                  onClick={() => setLockAspectRatio(!lockAspectRatio)}
                  variant={lockAspectRatio ? 'primary' : 'secondary'}
                  size="icon"
                  className="absolute left-1/2 top-[34px] h-7 w-7 -translate-x-1/2 rounded-full p-0"
                  title="종횡비 고정"
                >
                  {lockAspectRatio ? <Link size={14} /> : <Link2Off size={14} />}
                </Button>
              </div>

              <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                <p className="text-[11px] text-blue-400/80 leading-relaxed">
                  💡 픽셀 수를 줄이면 파일 용량이 크게 감소합니다. <br/>
                  저장 시 JPEG/WebP 품질을 낮추면 더 효과적입니다.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 bg-neutral-900/50 border-t border-neutral-700 flex gap-3">
              <Button
                onClick={onClose}
                variant="secondary"
                className="h-9 flex-1 rounded-lg text-sm"
              >
                취소
              </Button>
              <Button
                onClick={() => onResize(width, height)}
                variant="primary"
                className="h-9 flex-1 rounded-lg text-sm"
              >
                적용하기
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
