import ElementPlus from 'element-plus'
import en from 'element-plus/es/locale/lang/en'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import zhTw from 'element-plus/es/locale/lang/zh-tw'
import type { App } from 'vue'

import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'

import { resolveLanguage } from '@/services/i18n'

const locales = {
  en,
  zh: zhCn,
  zhtw: zhTw,
} as const

function resolveElementPlusLocale(language?: string) {
  const lang = resolveLanguage(language) as keyof typeof locales
  return locales[lang] ?? zhCn
}

export function setupElementPlus(app: App, language?: string) {
  app.use(ElementPlus, {
    locale: resolveElementPlusLocale(language),
    size: 'default',
  })
}
