import { SvgIcon } from '@mui/material'
import { useCallback } from 'react'

import iconDark from '@/assets/image/icon_dark.svg?react'
import iconLight from '@/assets/image/icon_light.svg?react'
import { useWindowControls } from '@/hooks/use-window'
import { useThemeMode } from '@/services/states'
import getSystem from '@/utils/get-system'

import { WindowControls } from './window-controller'

const APP_TITLE = 'Clash X'

export const CustomTitlebar = () => {
  const OS = getSystem()
  const mode = useThemeMode()
  const isDark = mode !== 'light'
  const isMac = OS === 'macos'
  const { toggleMaximize } = useWindowControls()

  const handleDoubleClick = useCallback(() => {
    void toggleMaximize()
  }, [toggleMaximize])

  return (
    <header className="app-titlebar" data-tauri-drag-region="false">
      {isMac ? (
        <div className="app-titlebar__controls app-titlebar__controls--leading">
          <WindowControls />
        </div>
      ) : (
        <div className="app-titlebar__brand" aria-hidden="true">
          <SvgIcon
            component={isDark ? iconDark : iconLight}
            sx={{ width: 16, height: 16 }}
            inheritViewBox
          />
          <span className="app-titlebar__title">{APP_TITLE}</span>
        </div>
      )}

      <div
        className="app-titlebar__drag"
        data-tauri-drag-region="true"
        onDoubleClick={handleDoubleClick}
      />

      {!isMac && (
        <div className="app-titlebar__controls app-titlebar__controls--trailing">
          <WindowControls />
        </div>
      )}
    </header>
  )
}
