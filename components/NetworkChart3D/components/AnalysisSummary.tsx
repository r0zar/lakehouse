import { Brain, Sparkles } from 'lucide-react';
import React from 'react';

interface AnalysisSummaryProps {
  analysis: string;
  className?: string;
}

// Simple markdown parser for basic formatting
const parseMarkdown = (text: string): React.ReactNode[] => {
  // Handle bold (**text**), italic (*text*), and code (`text`)
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      // Bold text
      const boldText = part.slice(2, -2);
      return (
        <strong key={index} className="text-[#00ff88] font-bold">
          {boldText}
        </strong>
      );
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2 && !part.startsWith('**')) {
      // Italic text
      const italicText = part.slice(1, -1);
      return (
        <em key={index} className="text-[#00ff88] font-medium italic">
          {italicText}
        </em>
      );
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      // Code text
      const codeText = part.slice(1, -1);
      return (
        <code key={index} className="bg-[#00ff88]/20 text-[#00ff88] px-1 py-0.5 rounded text-xs font-mono">
          {codeText}
        </code>
      );
    }
    return part;
  });
};

export const AnalysisSummary: React.FC<AnalysisSummaryProps> = ({ analysis, className = "" }) => {
  return (
    <div className={`bg-gradient-to-b from-black to-gray-900 border-2 border-[#00ff88]/30 rounded-none p-6 ${className}`}
         style={{ boxShadow: '0 0 25px rgba(0,255,136,0.3), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
      
      {/* Header with AI indicator */}
      <div className="flex items-center space-x-3 mb-4">
        <div className="relative">
          <Brain className="text-[#00ff88] animate-pulse" size={24} 
                 style={{ filter: 'drop-shadow(0 0 8px rgba(0,255,136,0.6))' }} />
          <Sparkles className="absolute -top-1 -right-1 text-[#00ff88] animate-pulse" size={12} />
        </div>
        
        <div>
          <h3 className="text-[#00ff88] font-mono font-bold text-sm uppercase tracking-wider">
            ◦ AI BEHAVIORAL ANALYSIS ◦
          </h3>
          <div className="text-xs text-gray-400 font-mono mt-1">
            Generated from {new Date().toLocaleString()} transaction data
          </div>
        </div>
      </div>

      {/* Analysis content */}
      <div className="bg-black/50 border border-[#00ff88]/20 p-4">
        <div className="text-gray-200 font-mono text-sm leading-relaxed space-y-2">
          {analysis.split('. ').map((sentence, index) => {
            const trimmedSentence = sentence.trim();
            if (!trimmedSentence) return null;
            
            return (
              <span key={index} className="block">
                {parseMarkdown(trimmedSentence)}
                {index < analysis.split('. ').length - 1 && '.'}
              </span>
            );
          })}
        </div>
      </div>

      {/* AI indicator footer */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#00ff88]/20">
        <div className="text-xs text-gray-500 font-mono">
          Analysis powered by behavioral pattern recognition
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-2 h-2 bg-[#00ff88] rounded-full animate-pulse"></div>
          <div className="text-xs text-[#00ff88] font-mono">AI ACTIVE</div>
        </div>
      </div>
    </div>
  );
};