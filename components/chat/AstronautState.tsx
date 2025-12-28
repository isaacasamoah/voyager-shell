"use client";

import React from 'react';

const ASSETS = {
  searching: "/astronaut/searching.png",
  success: "/astronaut/success.png",
  idle: "/astronaut/idle.png",
};

type AstronautStateType = 'idle' | 'searching' | 'success';

interface AstronautStateProps {
  state: AstronautStateType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const AstronautState = ({ state, size = 'md', className = '' }: AstronautStateProps) => {
  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-20 h-20',
  };

  const stateConfig = {
    idle: {
      src: ASSETS.idle,
      alt: 'Voyager Idle',
      animation: '',
    },
    searching: {
      src: ASSETS.searching,
      alt: 'Voyager Searching',
      animation: 'animate-pulse',
    },
    success: {
      src: ASSETS.success,
      alt: 'Voyager Success',
      animation: 'animate-[bounce_4s_infinite]',
    },
  };

  const config = stateConfig[state];

  return (
    <div className={`relative ${sizeClasses[size]} grayscale opacity-90 mix-blend-screen ${className}`}>
      <img
        src={config.src}
        alt={config.alt}
        className={`w-full h-full object-contain ${config.animation}`}
        style={{ filter: 'url(#terminal-dither) contrast(1.2)' }}
      />
    </div>
  );
};
