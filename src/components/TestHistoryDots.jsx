import { useLayoutEffect, useRef, useState } from "react";
import TestHistoryDotTooltip from "./TestHistoryDotTooltip";
import { DOT_GAP, DOT_SIZE } from "../lib/monitorDefaults";
import { getDotTone } from "../lib/monitorMetrics";

export default function TestHistoryDots({ api, availability, history }) {
  const viewportRef = useRef(null);
  const dotRefs = useRef(new Map());
  const [visibleDotCount, setVisibleDotCount] = useState(history.length);
  const [hoveredDotKey, setHoveredDotKey] = useState(null);
  const isTesting = api.status === "testing";

  useLayoutEffect(() => {
    const viewportElement = viewportRef.current;
    if (!viewportElement) {
      return undefined;
    }

    const updateVisibleDotCount = () => {
      const availableWidth = viewportElement.clientWidth;
      const slotWidth = DOT_SIZE + DOT_GAP;
      const maxVisibleSlots = slotWidth
        ? Math.floor((availableWidth + DOT_GAP) / slotWidth)
        : 0;
      const nextCount = Math.max(
        0,
        Math.min(history.length + (isTesting ? 1 : 0), maxVisibleSlots),
      );

      setVisibleDotCount((current) =>
        current === nextCount ? current : nextCount,
      );
    };

    const rafId = window.requestAnimationFrame(updateVisibleDotCount);
    const observer = new ResizeObserver(() => {
      updateVisibleDotCount();
    });

    observer.observe(viewportElement);

    return () => {
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [history.length, isTesting]);

  const historySlots = Math.max(0, visibleDotCount - (isTesting ? 1 : 0));
  const hiddenHistoryCount = Math.max(0, history.length - historySlots);

  return (
    <div className="test-dot-row">
      <span className={`test-availability ${availability.tone}`}>
        {availability.label}
      </span>
      <div ref={viewportRef} className="test-dot-viewport">
        {history.map((item, index) => {
          const tone = getDotTone(item);
          const isHidden = index < hiddenHistoryCount;
          const dotKey = `${api.id}-${item.at || "test"}-${index}`;
          const isHovered = hoveredDotKey === dotKey;

          return (
            <span
              key={dotKey}
              className={`test-dot-wrap${isHidden ? " is-hidden" : ""}`}
              ref={(element) => {
                if (!element) {
                  dotRefs.current.delete(dotKey);
                  return;
                }

                dotRefs.current.set(dotKey, element);
              }}
              onMouseEnter={() => setHoveredDotKey(dotKey)}
              onMouseLeave={() => setHoveredDotKey((current) => (current === dotKey ? null : current))}
            >
              <span className={`test-dot ${tone}`} />
              <TestHistoryDotTooltip
                anchorElement={dotRefs.current.get(dotKey) || null}
                item={item}
                open={isHovered}
              />
            </span>
          );
        })}
        {isTesting && visibleDotCount > 0 ? (
          <span className="test-dot loading" aria-hidden="true" />
        ) : null}
      </div>
    </div>
  );
}
