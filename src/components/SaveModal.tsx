import React, { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (filename: string, format: string, quality: number) => void;
  defaultFileName: string;
}

const FORMATS = [
  { label: 'PNG (Lossless)', value: 'image/png', ext: 'png' },
  { label: 'JPEG (Compressed)', value: 'image/jpeg', ext: 'jpg' },
  { label: 'WebP (Modern)', value: 'image/webp', ext: 'webp' },
];

export const SaveModal: React.FC<SaveModalProps> = ({ isOpen, onClose, onSave, defaultFileName }) => {
  const [filename, setFilename] = useState('');
  const [format, setFormat] = useState('image/png');
  const [quality, setQuality] = useState(90);

  useEffect(() => {
    if (isOpen) {
      const baseName = defaultFileName.split('.')[0] || 'image';
      setFilename(`edited-${baseName}`);
    }
  }, [isOpen, defaultFileName]);

  const handleSaveClick = () => {
    const selectedFormat = FORMATS.find(f => f.value === format);
    const finalFilename = filename.endsWith(`.${selectedFormat?.ext}`) 
      ? filename 
      : `${filename}.${selectedFormat?.ext}`;
    onSave(finalFilename, format, quality / 100);
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
            className="relative w-full max-w-md bg-neutral-800 border border-neutral-700 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700">
              <h2 className="text-lg font-semibold text-neutral-100">다른 이름으로 저장</h2>
              <button onClick={onClose} className="p-1 hover:bg-neutral-700 rounded-full transition-colors">
                <X size={20} className="text-neutral-400" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider">파일명</label>
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-2 text-neutral-100 focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="파일명 입력..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider">포맷</label>
                <div className="grid grid-cols-1 gap-2">
                  {FORMATS.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => setFormat(f.value)}
                      className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-all ${
                        format === f.value
                          ? 'bg-blue-500/10 border-blue-500 text-blue-400'
                          : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-neutral-600'
                      }`}
                    >
                      <span className="font-medium">{f.label}</span>
                      <span className="text-[10px] opacity-60 uppercase font-mono">.{f.ext}</span>
                    </button>
                  ))}
                </div>
              </div>

              {format !== 'image/png' && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider">품질</label>
                    <span className="text-xs text-blue-400 font-mono">{quality}%</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={quality}
                    onChange={(e) => setQuality(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-neutral-900 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-neutral-900/50 border-t border-neutral-700 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors font-medium"
              >
                취소
              </button>
              <button
                onClick={handleSaveClick}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors font-medium flex items-center justify-center gap-2"
              >
                <Download size={18} />
                저장하기
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
