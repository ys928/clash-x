import { useTranslation } from 'react-i18next'

import { VueIsland } from '@/bridges/vue-island'
import { AppPage } from '@/components/ui'
import ProxiesPage from '@/vue/pages/ProxiesPage.vue'

export default function ProxiesRoutePage() {
  const { t } = useTranslation()

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
    </AppPage>
  )
}
