import { useEffect, useRef } from "react";
import katex from "katex";

interface LatexRendererProps {
  tex: string;
  displayMode?: boolean;
}

export default function LatexRenderer({ tex, displayMode = true }: LatexRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      try {
        // Render the LaTeX string using katex
        katex.render(tex, containerRef.current, {
          displayMode,
          throwOnError: false,
          trust: true,
        });
      } catch (err) {
        console.error("KaTeX rendering error:", err);
        containerRef.current.textContent = tex;
      }
    }
  }, [tex, displayMode]);

  return (
    <div 
      ref={containerRef} 
      className={`overflow-x-auto py-1 text-emerald-400 font-mono scrollbar-thin ${
        displayMode ? "text-center my-2 text-sm sm:text-base md:text-lg" : "inline-block text-xs sm:text-sm"
      }`} 
    />
  );
}
