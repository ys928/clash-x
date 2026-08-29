import { useEffect, useRef, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createApp,
  type App,
  type Component,
  type ComponentPublicInstance,
} from 'vue'

import { setupElementPlus } from '@/vue/plugins/element-plus'

type VueIslandProps = {
  component: Component
  /** Props forwarded to the Vue root component. */
  props?: Record<string, unknown>
  className?: string
  style?: CSSProperties
}

/**
 * Mounts a Vue 3 component inside React. Used for gradual migration:
 * React owns the shell/router; new pages can be Vue SFCs.
 */
export function VueIsland({
  component,
  props,
  className,
  style,
}: VueIslandProps) {
  const { i18n } = useTranslation()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const appRef = useRef<App<Element> | null>(null)
  const instanceRef = useRef<ComponentPublicInstance | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props

  useEffect(() => {
    const el = hostRef.current
    if (!el) return

    const app = createApp(component, propsRef.current ?? {})
    setupElementPlus(app, i18n.language)
    instanceRef.current = app.mount(el) as ComponentPublicInstance
    appRef.current = app

    return () => {
      app.unmount()
      appRef.current = null
      instanceRef.current = null
      el.replaceChildren()
    }
  }, [component, i18n.language])

  useEffect(() => {
    const instance = instanceRef.current as
      | (ComponentPublicInstance & Record<string, unknown>)
      | null
    if (!instance || !props) return
    for (const [key, value] of Object.entries(props)) {
      instance[key] = value
    }
  }, [props])

  return <div ref={hostRef} className={className} style={style} />
}
