"use client";

import React from 'react';

interface UserMessageProps {
  content: string;
  timestamp?: string;
  username?: string;
}

export const UserMessage = ({
  content,
  timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
  username = 'you'
}: UserMessageProps) => {
  return (
    <div className="flex gap-4 opacity-80 hover:opacity-100 transition-opacity">
      <div className="w-12 pt-1 text-right text-slate-600 text-[10px] font-bold tracking-widest">
        {timestamp}
      </div>
      <div className="flex-1">
        <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">
          {username}
        </div>
        <div className="text-slate-200 leading-relaxed">
          {content}
        </div>
      </div>
    </div>
  );
};
