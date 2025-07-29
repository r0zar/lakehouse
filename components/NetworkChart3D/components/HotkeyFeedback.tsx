import React, { useState, useEffect } from 'react';

export interface HotkeyFeedbackProps {
  action: string | null;
  onComplete: () => void;
}

const actionLabels: Record<string, { label: string; icon: string; color: string }> = {
  'pin-tooltip': { label: 'Pinned to corner', icon: '📌', color: '#00ff88' },
  'focus-camera': { label: 'Camera focused', icon: '🎯', color: '#3B82F6' },
  'copy-address': { label: 'Address copied', icon: '📋', color: '#10B981' },
  'export-data': { label: 'Data exported', icon: '📄', color: '#8B5CF6' },
  'filter-network': { label: 'Network filter toggled', icon: '🔍', color: '#F59E0B' },
  'view-details': { label: 'Details opened', icon: '📊', color: '#EF4444' },
  'pin-limit-reached': { label: 'Maximum 3 tooltips pinned', icon: '⚠️', color: '#F59E0B' }
};

export const HotkeyFeedback: React.FC<HotkeyFeedbackProps> = ({ action, onComplete }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (action) {
      setIsVisible(true);
      
      // Auto-hide after 2 seconds
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onComplete, 300); // Wait for fade out
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [action, onComplete]);

  if (!action || !actionLabels[action]) {
    return null;
  }

  const { label, icon, color } = actionLabels[action];

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 
                  bg-gradient-to-r from-black to-gray-900 border-2 rounded-none font-mono 
                  transition-all duration-300 ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
      style={{
        borderColor: color,
        boxShadow: `0 0 20px ${color}40, inset 0 1px 0 rgba(255,255,255,0.1)`
      }}
    >
      <div className="px-6 py-4 flex items-center space-x-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <div className="text-white font-bold text-sm uppercase tracking-wider">
            {label}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Hotkey activated
          </div>
        </div>
        <div 
          className="w-2 h-2 rounded-full animate-pulse ml-3"
          style={{ 
            backgroundColor: color,
            boxShadow: `0 0 8px ${color}`
          }}
        />
      </div>
    </div>
  );
};