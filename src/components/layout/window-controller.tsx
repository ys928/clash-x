import { RemoveRounded } from '@mui/icons-material'
import {
  forwardRef,
  type PointerEvent,
  useCallback,
  useImperativeHandle,
} from 'react'

import { useWindowControls } from '@/hooks/use-window'
import getSystem from '@/utils/get-system'

const RESIZE_HANDLES = [
  { direction: 'North', position: 'north' },
  { direction: 'NorthEast', position: 'north-east' },
  { direction: 'East', position: 'east' },
  { direction: 'SouthEast', position: 'south-east' },
  { direction: 'South', position: 'south' },
  { direction: 'SouthWest', position: 'south-west' },
  { direction: 'West', position: 'west' },
  { direction: 'NorthWest', position: 'north-west' },
] as const

const CloseIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path
      d="M1.5 1.5l7 7M8.5 1.5l-7 7"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  </svg>
)

const MaximizeIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <rect
      x="1.5"
      y="1.5"
      width="7"
      height="7"
      rx="0.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
    />
  </svg>
)

const RestoreIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path
      d="M3 2.5h4.5V7M2.5 3v4.5H7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinejoin="round"
    />
  </svg>
)

export const WindowResizeHandles = () => {
  const { currentWindow, maximized } = useWindowControls()
  const OS = getSystem()

  const startResizeDragging = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return

      event.preventDefault()
      const direction = event.currentTarget.dataset.resizeDirection
      const handle = RESIZE_HANDLES.find((item) => item.direction === direction)

      if (handle) {
        void currentWindow
          .startResizeDragging(handle.direction)
          .catch((error) =>
            console.warn('[WindowResizeHandles] 调整窗口大小失败:', error),
          )
      }
    },
    [currentWindow],
  )

  const needsCustomResize =
    OS === 'linux' || OS === 'windows' || OS === 'unknown'
  if (!needsCustomResize || maximized) return null

  return (
    <div
      className="window-resize-handles"
      data-tauri-drag-region="false"
      aria-hidden="true"
    >
      {RESIZE_HANDLES.map(({ direction, position }) => (
        <div
          key={direction}
          className={`window-resize-handle window-resize-handle--${position}`}
          data-resize-direction={direction}
          onPointerDown={startResizeDragging}
        />
      ))}
    </div>
  )
}

export const WindowControls = forwardRef(function WindowControls(_props, ref) {
  const OS = getSystem()
  const {
    currentWindow,
    maximized,
    minimize,
    close,
    toggleFullscreen,
    toggleMaximize,
  } = useWindowControls()

  useImperativeHandle(
    ref,
    () => ({
      currentWindow,
      maximized,
      minimize,
      close,
      toggleFullscreen,
      toggleMaximize,
    }),
    [
      currentWindow,
      maximized,
      minimize,
      close,
      toggleFullscreen,
      toggleMaximize,
    ],
  )

  if (OS === 'macos') {
    return (
      <div className="window-controls window-controls--mac">
        <button
          type="button"
          className="window-controls__mac-btn window-controls__mac-btn--close"
          aria-label="Close"
          onClick={close}
        />
        <button
          type="button"
          className="window-controls__mac-btn window-controls__mac-btn--minimize"
          aria-label="Minimize"
          onClick={minimize}
        />
        <button
          type="button"
          className="window-controls__mac-btn window-controls__mac-btn--maximize"
          aria-label={maximized ? 'Restore' : 'Maximize'}
          data-window-action="maximize"
          onClick={toggleMaximize}
        />
      </div>
    )
  }

  return (
    <div className="window-controls window-controls--win">
      <button
        type="button"
        className="window-controls__win-btn"
        aria-label="Minimize"
        onClick={minimize}
      >
        <RemoveRounded sx={{ fontSize: 14 }} />
      </button>
      <button
        type="button"
        className="window-controls__win-btn"
        aria-label={maximized ? 'Restore' : 'Maximize'}
        data-window-action="maximize"
        onClick={toggleMaximize}
      >
        {maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <button
        type="button"
        className="window-controls__win-btn window-controls__win-btn--close"
        aria-label="Close"
        onClick={close}
      >
        <CloseIcon />
      </button>
    </div>
  )
})
