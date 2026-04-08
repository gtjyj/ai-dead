import { useLayoutEffect, useRef } from "react";
import { formatAvailability, getDotTone } from "../lib/monitorMetrics";

function getAvailabilityDisplay(history) {
  return formatAvailability(history);
}

export default function StatusFloatWindow({ api }) {
  const cardRef = useRef(null);
  const dragStateRef = useRef({
    dragStarted: false,
    moved: false,
    dragEnabled: false,
    pointerId: null,
  });
  const history = (api?.testHistory || []).slice(-10);
  const visibleHistory = history.length ? history : [];
  const availability = getAvailabilityDisplay(visibleHistory);
  const title = api?.name || "API 状态";

  useLayoutEffect(() => {
    const cardElement = cardRef.current;
    if (!cardElement) {
      return undefined;
    }

    let frameId = 0;

    const syncWindowSize = () => {
      cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const rect = cardElement.getBoundingClientRect();
        void window.monitorApi.resizeCurrentWindow({
          width: Math.ceil(rect.width),
          height: Math.ceil(rect.height),
        });
      });
    };

    syncWindowSize();

    const resizeObserver = new ResizeObserver(() => {
      syncWindowSize();
    });

    resizeObserver.observe(cardElement);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, [api?.id, title, availability.label, visibleHistory.length]);

  function handleDoubleClick() {
    void window.monitorApi.focusMainWindow();
  }

  async function handlePointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    const dragEnabled = await window.monitorApi.beginWindowDrag({
      screenX: event.screenX,
      screenY: event.screenY,
    });

    dragStateRef.current = {
      dragStarted: Boolean(dragEnabled),
      moved: false,
      dragEnabled: Boolean(dragEnabled),
      pointerId: event.pointerId ?? null,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    const dragState = dragStateRef.current;
    if (!dragState.dragStarted) {
      return;
    }

    if (
      !dragState.moved &&
      (Math.abs(event.movementX) > 0 || Math.abs(event.movementY) > 0)
    ) {
      dragStateRef.current.moved = true;
    }

    if (!dragState.moved) {
      return;
    }
  }

  function handlePointerUp(event) {
    if (dragStateRef.current.pointerId !== null) {
      event.currentTarget.releasePointerCapture?.(dragStateRef.current.pointerId);
    }

    if (dragStateRef.current.dragEnabled) {
      void window.monitorApi.endWindowDrag();
    }

    dragStateRef.current.dragStarted = false;
    dragStateRef.current.dragEnabled = false;
    dragStateRef.current.pointerId = null;
  }

  function handlePointerCancel(event) {
    handlePointerUp(event);
  }

  function handleClick(event) {
    if (dragStateRef.current.moved) {
      event.preventDefault();
      dragStateRef.current.moved = false;
    }
  }

  if (!api) {
    return null;
  }

  return (
    <div
      ref={cardRef}
      className="status-float-card"
      title={title}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="status-float-metric">
        <span className="status-float-name">{title}</span>
        <strong className={`status-float-metric-value ${availability.tone}`}>
          {availability.label}
        </strong>
      </div>
      <div
        className="status-float-dots"
        aria-label={`${api?.name || "API"} 最近 10 次状态`}
        onDoubleClick={handleDoubleClick}
      >
        {visibleHistory.length ? (
          visibleHistory.map((item, index) => {
            return (
              <span
                key={`${item.at || "item"}-${index}`}
                className="status-float-dot-wrap"
                onDoubleClick={handleDoubleClick}
              >
                <span
                  className={`status-float-dot ${getDotTone(item)}`}
                  aria-label={item.detail || "暂无结果"}
                />
              </span>
            );
          })
        ) : (
          <span className="status-float-empty">暂无测试结果</span>
        )}
      </div>
    </div>
  );
}
