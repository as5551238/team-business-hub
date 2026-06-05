import { useEffect, useRef, useCallback } from 'react';

/**
 * useFocusTrap — Traps keyboard focus within a container element.
 * When active, Tab/Shift+Tab cycle only through focusable children.
 * Esc optionally calls onEscape.
 *
 * Usage: const ref = useFocusTrap(isOpen, () => close());
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled]):not([aria-hidden="true"])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function useFocusTrap(active: boolean, onEscape?: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);

  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter(el => el.offsetParent !== null); // visible only
  }, []);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    // Auto-focus the first focusable element when trap activates
    const focusables = getFocusableElements();
    if (focusables.length > 0) {
      // Delay to ensure DOM is ready
      const timer = setTimeout(() => focusables[0].focus(), 50);
      return () => clearTimeout(timer);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onEscape?.();
        return;
      }

      if (e.key !== 'Tab') return;

      const elements = getFocusableElements();
      if (elements.length === 0) return;

      const first = elements[0];
      const last = elements[elements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [active, onEscape, getFocusableElements]);

  return containerRef;
}
