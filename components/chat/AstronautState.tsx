"use client";

import React from 'react';

const ASSETS = {
  success: "/images/astronaut/success.png",
  searching: "/images/astronaut/searching.png",
  idle: "/images/astronaut/idle.png",
  error: "/images/astronaut/error.png",
  listening: "/images/astronaut/listening.png",
  celebrating: "/images/astronaut/celebrating.png",
};

type AstronautStateType = 'idle' | 'searching' | 'success' | 'error' | 'listening' | 'celebrating';

interface AstronautStateProps {
  state: AstronautStateType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const AstronautState = ({ state, size = 'md', className = '' }: AstronautStateProps) => {
  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32',
  };

  const stateConfig = {
    idle: {
      src: ASSETS.idle,
      alt: 'Voyager at rest',
      animation: 'animate-float-slow',
    },
    searching: {
      src: ASSETS.searching,
      alt: 'Voyager searching',
      animation: 'animate-float-drift',
    },
    success: {
      src: ASSETS.success,
      alt: 'Voyager success',
      animation: 'animate-float',
    },
    error: {
      src: ASSETS.error,
      alt: 'Voyager encountered an error',
      animation: 'animate-float',
    },
    listening: {
      src: ASSETS.listening,
      alt: 'Voyager listening',
      animation: 'animate-float-slow',
    },
    celebrating: {
      src: ASSETS.celebrating,
      alt: 'Voyager celebrating',
      animation: 'animate-float-drift',
    },
  };

  const config = stateConfig[state];

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      <img
        src={config.src}
        alt={config.alt}
        className={`w-full h-full object-contain ${config.animation}`}
      />
    </div>
  );
};
