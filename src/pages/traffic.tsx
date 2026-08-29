import { useTranslation } from 'react-i18next'

import { VueIsland } from '@/bridges/vue-island'
import { AppPage } from '@/components/ui'
import DomainTrafficPage from '@/vue/pages/DomainTrafficPage.vue'

export default function TrafficPage() {
  const { t } = useTranslation()

  return (
    <AppPage title={t('layout.components.navigation.tabs.traffic')} lockScroll>
      <VueIsland
        component={DomainTrafficPage}
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
    </AppPage>
  )
}
