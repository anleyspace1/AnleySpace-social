import React from 'react';
import { getOptimizedImageUrl } from '../lib/utils';

interface ResponsiveImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'avif' | 'origin';
  className?: string;
  containerClassName?: string;
  aspectRatio?: string;
  loading?: 'lazy' | 'eager';
}

/**
 * A responsive image component that uses optimized URLs and lazy loading.
 */
export function ResponsiveImage({
  src,
  alt,
  width,
  height,
  quality = 80,
  format = 'webp',
  className = '',
  containerClassName = '',
  aspectRatio,
  loading = 'lazy',
  ...props
}: ResponsiveImageProps) {
  const optimizedSrc = getOptimizedImageUrl(src, { width, height, quality, format });

  // If aspect ratio is provided, wrap in a container to maintain it
  if (aspectRatio) {
    return (
      <div 
        className={`relative overflow-hidden ${containerClassName}`} 
        style={{ aspectRatio }}
      >
        <img
          src={optimizedSrc}
          alt={alt}
          loading={loading}
          className={`w-full h-full object-cover ${className}`}
          referrerPolicy="no-referrer"
          {...props}
        />
      </div>
    );
  }

  return (
    <img
      src={optimizedSrc}
      alt={alt}
      loading={loading}
      className={className}
      referrerPolicy="no-referrer"
      {...props}
    />
  );
}
