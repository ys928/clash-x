import { SvgIcon } from '@mui/material'
import { useLockFn } from 'ahooks'
import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import iconDark from '@/assets/image/icon_dark.svg?react'
import iconLight from '@/assets/image/icon_light.svg?react'
import { DialogRef } from '@/components/base'
import { UpdateViewer } from '@/components/setting/mods/update-viewer'
import { useSilentUpdateStatus } from '@/hooks/use-silent-update-status'
import { useUpdate } from '@/hooks/use-update'
import { useWindowControls } from '@/hooks/use-window'
import { installDownloadedUpdate } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import { useThemeMode } from '@/services/states'
import getSystem from '@/utils/get-system'

import { WindowControls } from './window-controller'

const APP_TITLE = 'Clash X'

export const CustomTitlebar = () => {
  const { t } = useTranslation()
  const OS = getSystem()
  const mode = useThemeMode()
  const isDark = mode !== 'light'
  const isMac = OS === 'macos'
  const { toggleMaximize } = useWindowControls()
  const updateStatus = useSilentUpdateStatus()
  const { checkUpdate } = useUpdate()
  const updateRef = useRef<DialogRef>(null)

  const handleDoubleClick = useCallback(() => {
    void toggleMaximize()
  }, [toggleMaximize])

  const onNewVersionClick = useLockFn(async () => {
    if (updateStatus.downloaded) {
      try {
        await installDownloadedUpdate()
      } catch (err) {
        showNotice.error(err)
      }
      return
    }

    try {
      const { data } = await checkUpdate()
      if (!data?.available) {
        showNotice.success(
          'settings.components.verge.advanced.notifications.latestVersion',
        )
        return
      }
      updateRef.current?.open()
    } catch (err) {
      showNotice.error(err)
    }
  })

  const newVersionButton = updateStatus.available ? (
    <button
      type="button"
      className="app-titlebar__update-btn"
      data-tauri-drag-region="false"
      onClick={() => {
        void onNewVersionClick()
      }}
      title={
        updateStatus.version
          ? t('layout.components.titlebar.newVersionTooltip', {
              version: updateStatus.version,
            })
          : t('layout.components.titlebar.newVersion')
      }
    >
      {t('layout.components.titlebar.newVersion')}
      {updateStatus.version ? ` v${updateStatus.version}` : ''}
    </button>
  ) : null

  return (
    <header className="app-titlebar" data-tauri-drag-region="false">
      <UpdateViewer ref={updateRef} />

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

      <div className="app-titlebar__controls app-titlebar__controls--trailing">
        {newVersionButton}
        {!isMac && <WindowControls />}
      </div>
    </header>
  )
}
