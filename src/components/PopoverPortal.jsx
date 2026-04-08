import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function getPopoverPosition(anchorRect, popoverRect, placement, offset) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  let left = 12;
  let top = 12;
  let arrowLeft = null;

  if (placement === "top-center") {
    left = anchorRect.left + anchorRect.width / 2 - popoverRect.width / 2;
    top = anchorRect.top - popoverRect.height - offset;
  } else {
    left = anchorRect.right - popoverRect.width;
    top = anchorRect.top - popoverRect.height - offset;
  }

  left = Math.min(Math.max(12, left), viewportWidth - popoverRect.width - 12);

  if (placement === "top-center") {
    const anchorCenterX = anchorRect.left + anchorRect.width / 2;
    arrowLeft = Math.min(
      Math.max(18, anchorCenterX - left),
      popoverRect.width - 18,
    );
  }

  if (top < 12) {
    top = Math.min(anchorRect.bottom + offset, viewportHeight - popoverRect.height - 12);
  }

  return {
    arrowLeft,
    left: Math.max(12, left) + scrollX,
    top: Math.max(12, top) + scrollY,
  };
}

export default function PopoverPortal({
  anchorElement,
  children,
  className = "",
  closeOnEscape = false,
  closeOnOutsideClick = false,
  onRequestClose,
  open,
  placement = "top-end",
  portalClassName = "",
  offset = 8,
  usePortal = true,
}) {
  const popoverRef = useRef(null);
  const [position, setPosition] = useState(null);

  useEffect(() => {
    if (!open || !onRequestClose) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!closeOnOutsideClick) {
        return;
      }

      const insideAnchor = anchorElement?.contains(event.target);
      const insidePopover = popoverRef.current?.contains(event.target);

      if (!insideAnchor && !insidePopover) {
        onRequestClose();
      }
    }

    function handleKeyDown(event) {
      if (closeOnEscape && event.key === "Escape") {
        onRequestClose();
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorElement, closeOnEscape, closeOnOutsideClick, onRequestClose, open]);

  useLayoutEffect(() => {
    if (!open || !anchorElement) {
      setPosition(null);
      return undefined;
    }

    function updatePosition() {
      const popoverElement = popoverRef.current;
      if (!popoverElement) {
        return;
      }

      const anchorRect = anchorElement.getBoundingClientRect();
      const popoverRect = popoverElement.getBoundingClientRect();
      setPosition(getPopoverPosition(anchorRect, popoverRect, placement, offset));
    }

    const rafId = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorElement, offset, open, placement]);

  if (!open) {
    return null;
  }

  const content = (
    <div
      className={`popover-portal ${portalClassName}`.trim()}
      style={position ? {
        left: `${position.left}px`,
        top: `${position.top}px`,
        ...(typeof position.arrowLeft === "number"
          ? { "--popover-arrow-left": `${position.arrowLeft}px` }
          : {}),
      } : { visibility: "hidden" }}
    >
      <div ref={popoverRef} className={className}>
        {children}
      </div>
    </div>
  );

  if (!usePortal) {
    return content;
  }

  return createPortal(content, document.body);
}
