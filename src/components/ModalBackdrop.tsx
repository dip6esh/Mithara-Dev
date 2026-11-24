import { useEffect, useRef, type ReactNode } from "react";

/**
 * Shared backdrop for every admin popup / modal.
 *
 * - Clicking (or tapping) anywhere on the dimmed area outside the card closes it.
 * - Pressing Escape closes it.
 * - Page behind stops scrolling while it is open.
 *
 * Close only fires when the press STARTS on the backdrop itself, so selecting text inside
 * the card and releasing the mouse outside it does not close the modal by accident.
 */
export function ModalBackdrop({
  onClose,
  children,
  className = "",
}: {
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const pressedOnBackdrop = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A confirmation box on top handles Escape itself; only the top-most box should close.
      if (e.key === "Escape" && !document.body.dataset.confirmOpen) closeRef.current();
    };
    const prev = document.body.style.overflow;
    const prevPadding = document.body.style.paddingRight;
    const widthBefore = document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    // Locking the page can remove the scrollbar and widen the page, which makes everything jump.
    // Fill the gap it leaves so nothing moves (no-op when the scrollbar space is already reserved).
    const gap = document.documentElement.clientWidth - widthBefore;
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      document.body.style.paddingRight = prevPadding;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={`adm-backdrop fixed inset-0 z-50 flex items-center justify-center bg-[#1c1733]/70 p-4 backdrop-blur-sm ${className}`}
      onPointerDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressedOnBackdrop.current && e.target === e.currentTarget) onClose();
        pressedOnBackdrop.current = false;
      }}
    >
      {children}
    </div>
  );
}
