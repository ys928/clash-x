import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { VueIsland } from '@/bridges/vue-island'
import { AutoSwitchPanel } from '@/components/proxy/auto-switch-panel'
import { AppPage } from '@/components/ui'
import ProxiesPage from '@/vue/pages/ProxiesPage.vue'

const OPEN_AUTO_SWITCH_EVENT = 'clash-x:open-auto-switch'

export default function ProxiesRoutePage() {
  const { t } = useTranslation()
  const [autoSwitchOpen, setAutoSwitchOpen] = useState(false)

  useEffect(() => {
    const onOpen = () => setAutoSwitchOpen(true)
    window.addEventListener(OPEN_AUTO_SWITCH_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_AUTO_SWITCH_EVENT, onOpen)
  }, [])

  return (
    <AppPage
      full
      lockScroll
      title={t('proxies.page.title.default')}
      contentStyle={{ height: '100%' }}
    >
      <VueIsland
        component={ProxiesPage}
        style={{
          flex: 1,
          minHeight: 0,
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      />
      <AutoSwitchPanel
        open={autoSwitchOpen}
        onClose={() => setAutoSwitchOpen(false)}
      />
    </AppPage>
  )
}
