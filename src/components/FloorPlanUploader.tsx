import React, { useRef } from 'react';
import { Upload, X, Map } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { FloorPlanImage } from '../types';

interface FloorPlanUploaderProps {
  images: FloorPlanImage[];
  setImages: React.Dispatch<React.SetStateAction<FloorPlanImage[]>>;
}

export default function FloorPlanUploader({ images, setImages }: FloorPlanUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = (files: FileList | null | undefined) => {
    if (!files || files.length === 0) return;
    
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      
      const reader = new FileReader();
      reader.onload = (e) => {
         const result = e.target?.result as string;
         if (result) {
            // Pick a clean default name from filename with first letter capitalized
            const rawName = file.name.split('.').slice(0, -1).join('.') || 'Floor Plan Layout';
            const cleanName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
            const safeId = typeof crypto !== 'undefined' && crypto.randomUUID 
              ? crypto.randomUUID() 
              : 'fp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
            setImages(prev => [...prev, {
              id: safeId,
              name: cleanName,
              data: result
            }]);
         }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(event.target.files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    processFiles(e.dataTransfer.files);
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const updateImageName = (index: number, newName: string) => {
    setImages(prev => prev.map((img, i) => i === index ? { ...img, name: newName } : img));
  };

  return (
    <div className="w-full max-w-4xl bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 shadow-slate-100 dark:shadow-none animate-fade-in">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-emerald-100 dark:bg-emerald-950/30 rounded-xl animate-pulse-slow">
          <Map className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight font-sans">Floor Plans</h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Upload and label the electrical floor plans for inclusion in the report</p>
        </div>
      </div>

      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="w-full h-40 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-all cursor-pointer mb-8 shadow-inner"
      >
        <Upload className="w-10 h-10 text-slate-400 dark:text-slate-500 mb-2" />
        <p className="text-slate-600 dark:text-slate-300 font-semibold mb-1">Click or drag images here</p>
        <p className="text-slate-400 dark:text-slate-500 text-sm">Supports PNG, JPG, JPEG (Multiple allowed)</p>
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          multiple
          className="hidden"
        />
      </motion.div>

      {images.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <AnimatePresence>
            {images.map((image, index) => (
              <motion.div 
                key={image.id || index}
                initial={{ opacity: 0, scale: 0.95, y: 10 }} 
                animate={{ opacity: 1, scale: 1, y: 0 }} 
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={{ duration: 0.2 }}
                className="relative flex flex-col bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4 overflow-hidden border border-slate-200/80 dark:border-slate-700/80 shadow-md hover:shadow-lg transition-all"
              >
                {/* Image Container with solid background and centering */}
                <div className="relative w-full h-52 bg-slate-200/40 dark:bg-slate-900/60 rounded-xl flex items-center justify-center overflow-hidden p-3 border border-slate-200/40 dark:border-slate-700/40">
                  <img 
                    src={image.data} 
                    alt={image.name || `Floor Plan ${index + 1}`} 
                    className="max-w-full max-h-full object-contain rounded shadow-sm hover:scale-105 transition-transform duration-300 pointer-events-none" 
                  />
                  <button 
                    onClick={(e) => { e.stopPropagation(); removeImage(index); }}
                    className="absolute top-2 right-2 p-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm text-slate-800 dark:text-slate-200 rounded-full shadow-md hover:bg-rose-500 hover:text-white dark:hover:bg-rose-500 dark:hover:text-white transition-colors"
                    title="Remove image"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Name/Label Input Box */}
                <div className="mt-4 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    Floor Plan Custom Name
                  </label>
                  <input
                    type="text"
                    value={image.name}
                    onChange={(e) => updateImageName(index, e.target.value)}
                    placeholder="e.g., Ground Floor Lighting Layout"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-900 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition-all shadow-sm"
                  />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
