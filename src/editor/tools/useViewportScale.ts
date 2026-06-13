import { useEffect, useState, type RefObject } from 'react';

function calculateFitScale(width: number, height: number, targetWidth: number, targetHeight: number) {
  return Math.max(0.05, Math.min(width / targetWidth, height / targetHeight));
}

export function useViewportScale<T extends HTMLElement>(
  ref: RefObject<T | null>,
  horizontalPadding: number,
  verticalPadding: number,
  initialScale: number,
  targetWidth: number,
  targetHeight: number
) {
  const [scale, setScale] = useState(initialScale);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const measure = () => {
      const rect = element.getBoundingClientRect();
      const width = Math.max(1, rect.width - horizontalPadding);
      const height = Math.max(1, rect.height - verticalPadding);
      setScale(calculateFitScale(width, height, targetWidth, targetHeight));
    };

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.parentElement) {
      observer.observe(element.parentElement);
    }

    measure();

    return () => {
      observer.disconnect();
    };
  }, [horizontalPadding, ref, targetHeight, targetWidth, verticalPadding]);

  return scale;
}
