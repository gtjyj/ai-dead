import PopoverPortal from "./PopoverPortal";
import { formatDate, formatLatency } from "../lib/monitorFormatters";
import {
  formatDotStatus,
  getDotDetail,
  getDotTone,
} from "../lib/monitorMetrics";

export default function TestHistoryDotTooltip({ anchorElement, item, open, usePortal = true }) {
  const tone = getDotTone(item);

  return (
    <PopoverPortal
      anchorElement={anchorElement}
      className="test-tooltip"
      open={open}
      usePortal={usePortal}
      placement="top-center"
      portalClassName="test-tooltip-portal"
      offset={12}
    >
      <span className="test-tooltip-surface">
        <span className="test-tooltip-head">
          <span className={`test-tooltip-status ${tone}`}>
            {formatDotStatus(item)}
          </span>
          <span>{formatLatency(item?.latencyMs)}</span>
        </span>
        <span className="test-tooltip-time">{formatDate(item?.at)}</span>
        <span className="test-tooltip-detail">{getDotDetail(item)}</span>
      </span>
    </PopoverPortal>
  );
}
