import { Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import type { CSSProperties, ReactNode } from 'react'

import { BaseErrorBoundary } from '@/components/base/base-error-boundary'
import { typographyScale } from '@/theme/tokens'

export interface AppPageProps {
  title?: ReactNode
  header?: ReactNode
  contentStyle?: CSSProperties
  children?: ReactNode
  full?: boolean
  /** Disable native section scrolling so children can own the scroll container. */
  lockScroll?: boolean
}

export const AppPage: React.FC<AppPageProps> = ({
  title,
  header,
  contentStyle,
  full,
  lockScroll,
  children,
}) => {
  const theme = useTheme()

  return (
    <BaseErrorBoundary>
      <div className="base-page">
        <header data-tauri-drag-region="true" style={{ userSelect: 'none' }}>
          <Typography
            sx={{
              fontSize: typographyScale.fontSizeXl,
              fontWeight: typographyScale.fontWeightSemibold,
              color: 'text.primary',
            }}
            data-tauri-drag-region="true"
          >
            {title}
          </Typography>

          {header}
        </header>

        <div
          className={full ? 'base-container no-padding' : 'base-container'}
          style={{
            backgroundColor: theme.palette.background.default,
            ...(lockScroll ? { flex: 1, minHeight: 0, height: 'auto' } : null),
          }}
        >
          <section
            style={{
              backgroundColor: theme.palette.background.default,
              ...(lockScroll
                ? {
                    overflow: 'hidden',
                    scrollbarGutter: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                  }
                : null),
            }}
          >
            <div
              className="base-content"
              style={{
                ...(lockScroll
                  ? {
                      flex: 1,
                      minHeight: 0,
                      height: '100%',
                      maxHeight: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      boxSizing: 'border-box',
                    }
                  : null),
                ...contentStyle,
              }}
            >
              {children}
            </div>
          </section>
        </div>
      </div>
    </BaseErrorBoundary>
  )
}
