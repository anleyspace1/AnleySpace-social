import React from 'react';
import { cn } from '../lib/utils';

/** Full-width placeholder for protected routes while auth session resolves */
export function RouteShellSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('min-h-[50vh] w-full animate-pulse px-4 py-6', className)}>
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="h-10 w-3/4 max-w-md rounded-xl bg-gray-200 dark:bg-gray-800" />
        <div className="h-64 w-full rounded-2xl bg-gray-100 dark:bg-gray-900" />
        <div className="space-y-3">
          <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-800" />
        </div>
      </div>
    </div>
  );
}

export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-6 pb-4" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          <div className="flex items-center gap-3 p-4">
            <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200 dark:bg-gray-800" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-28 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="h-2 w-16 rounded bg-gray-100 dark:bg-gray-800" />
            </div>
          </div>
          <div className="aspect-square w-full bg-gray-100 dark:bg-gray-800" />
          <div className="space-y-2 p-4">
            <div className="h-3 w-full rounded bg-gray-100 dark:bg-gray-800" />
            <div className="h-3 w-2/3 rounded bg-gray-100 dark:bg-gray-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProfileHeaderSkeleton() {
  return (
    <div className="animate-pulse px-4 lg:px-0">
      <div className="mb-12 flex flex-col items-center gap-8 md:flex-row md:items-start">
        <div className="h-32 w-32 shrink-0 rounded-full bg-gray-200 dark:bg-gray-800 md:h-40 md:w-40" />
        <div className="flex-1 space-y-4 text-center md:text-left">
          <div className="mx-auto h-8 max-w-xs rounded bg-gray-200 dark:bg-gray-800 md:mx-0" />
          <div className="mx-auto h-4 max-w-[180px] rounded bg-gray-100 dark:bg-gray-800 md:mx-0" />
          <div className="flex justify-center gap-4 md:justify-start">
            <div className="h-10 w-24 rounded-xl bg-gray-200 dark:bg-gray-800" />
            <div className="h-10 w-24 rounded-xl bg-gray-200 dark:bg-gray-800" />
          </div>
        </div>
      </div>
      <div className="mb-8 grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1 sm:gap-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="aspect-square rounded-lg bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    </div>
  );
}

export function ProductDetailSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 py-6 md:p-8">
      <div className="mb-6 h-8 w-24 rounded bg-gray-200 dark:bg-gray-800" />
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="aspect-square w-full rounded-2xl bg-gray-100 dark:bg-gray-800" />
        <div className="space-y-4">
          <div className="h-8 w-3/4 rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-6 w-1/3 rounded bg-gray-100 dark:bg-gray-800" />
          <div className="h-24 w-full rounded-xl bg-gray-100 dark:bg-gray-800" />
          <div className="h-12 w-full rounded-xl bg-gray-200 dark:bg-gray-800" />
        </div>
      </div>
    </div>
  );
}

export function SavedGridSkeleton() {
  return (
    <div className="grid animate-pulse grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="aspect-video rounded-2xl bg-gray-100 dark:bg-gray-800" />
      ))}
    </div>
  );
}

export function ReelsFeedSkeleton() {
  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#0A0A0A]">
      <div className="absolute top-0 left-0 right-0 z-[100] h-14 bg-gradient-to-b from-black/80 to-transparent sm:h-16" />
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-md space-y-4">
          <div className="mx-auto aspect-[9/16] max-h-[70vh] w-full animate-pulse rounded-2xl bg-white/10" />
          <div className="mx-auto h-3 w-32 rounded bg-white/10" />
        </div>
      </div>
    </div>
  );
}
