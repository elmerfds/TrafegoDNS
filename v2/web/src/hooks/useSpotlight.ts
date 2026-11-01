/**
 * useSpotlight Hook
 * Applies spotlight highlighting effect to an element
 */
import { useEffect, useRef } from 'react';
import { useSpotlightContext } from '../contexts/SpotlightContext';

/**
 * Hook to apply spotlight effect to an element
 * @param elementId - The ID of the element to spotlight
 * @returns A ref to attach to the element
 */
export function useSpotlight<T extends HTMLElement>(elementId: string) {
  const { spotlightId, clearSpotlight } = useSpotlightContext();
  const ref = useRef<T>(null);

  useEffect(() => {
    if (spotlightId === elementId && ref.current) {
      // Small delay to allow page navigation to complete
      const scrollTimer = setTimeout(() => {
        if (ref.current) {
          // Scroll element into view
          ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });

          // Add spotlight class
          ref.current.classList.add('spotlight-active');

          // Remove spotlight after animation completes
          const clearTimer = setTimeout(() => {
            ref.current?.classList.remove('spotlight-active');
            clearSpotlight();
          }, 2000);

          return () => clearTimeout(clearTimer);
        }
      }, 100);

      return () => clearTimeout(scrollTimer);
    }
  }, [spotlightId, elementId, clearSpotlight]);

  return ref;
}

/**
 * Hook to check if a specific element is being spotlighted
 * @param elementId - The ID to check
 * @returns Whether the element is currently spotlighted
 */
export function useIsSpotlighted(elementId: string): boolean {
  const { spotlightId } = useSpotlightContext();
  return spotlightId === elementId;
}
