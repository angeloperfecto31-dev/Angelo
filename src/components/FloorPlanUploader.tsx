import React, { useRef } from 'react';
import { Upload, X, Map } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface FloorPlanUploaderProps {
  images: string[];
  setImages: React.Dispatch<React.SetStateAction<string[]>>;
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
            setImages(prev => [...prev, result]);
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

  return (
    <div className="w-full max-w-4xl bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 shadow-slate-100 dark:shadow-none">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-emerald-100 dark:bg-emerald-950/30 rounded-xl">
          <Map className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight font-sans">Floor Plans</h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Upload the electrical floor plans for inclusion in the report</p>
        </div>
      </div>

      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="w-full h-40 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer mb-8"
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
                key={index}
                initial={{ opacity: 0, scale: 0.9 }} 
                animate={{ opacity: 1, scale: 1 }} 
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative flex justify-center bg-slate-100 dark:bg-slate-800 rounded-2xl p-2 overflow-hidden border border-slate-200 dark:border-slate-700"
              >
                <img src={image} alt={`Floor Plan ${index + 1}`} className="max-w-full h-auto object-contain rounded-xl shadow-sm" />
                <button 
                  onClick={(e) => { e.stopPropagation(); removeImage(index); }}
                  className="absolute top-4 right-4 p-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm text-slate-800 dark:text-slate-200 rounded-full shadow hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  title="Remove image"
                >
                  <X className="w-5 h-5" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
