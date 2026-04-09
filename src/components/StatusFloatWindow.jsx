import { useLayoutEffect, useRef } from "react";
import { getDotTone } from "../lib/monitorMetrics";

function getAutoCheckStatus(api, isRunning) {
  if (isRunning && !api?.paused) {
    return {
      label: "巡检中",
      tone: "running",
    };
  }

  return {
    label: "暂停",
    tone: "paused",
  };
}

export default function StatusFloatWindow({ api, isRunning }) {
  const cardRef = useRef(null);
  const dragStateRef = useRef({
    dragStarted: false,
    moved: false,
    dragEnabled: false,
    pointerId: null,
  });
  const history = (api?.testHistory || []).slice(-10);
  const visibleHistory = history.length ? history : [];
  const title = api?.name || "API 状态";
  const autoCheckStatus = getAutoCheckStatus(api, isRunning);
  const isTesting = api?.status === "testing";
  const displayHistory = isTesting && visibleHistory.length
    ? visibleHistory.slice(1)
    : visibleHistory;

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
  }, [api?.id, title, autoCheckStatus.label, visibleHistory.length]);

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
        <strong className={`status-float-metric-value ${autoCheckStatus.tone}`}>
          {autoCheckStatus.label}
        </strong>
      </div>
      <div
        className="status-float-dots"
        aria-label={`${api?.name || "API"} 最近 10 次状态`}
        onDoubleClick={handleDoubleClick}
      >
        {displayHistory.length ? (
          <>
            {displayHistory.map((item, index) => {
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
            })}
            {isTesting ? (
              <span className="status-float-dot loading" aria-hidden="true" />
            ) : null}
          </>
        ) : (
          isTesting ? (
            <span className="status-float-dot loading" aria-hidden="true" />
          ) : (
            <span className="status-float-empty">暂无测试结果</span>
          )
        )}
      </div>
    </div>
  );
}
