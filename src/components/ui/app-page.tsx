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
}

export const AppPage: React.FC<AppPageProps> = ({
  title,
  header,
  contentStyle,
  full,
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
          style={{ backgroundColor: theme.palette.background.default }}
        >
          <section
            style={{
              backgroundColor: theme.palette.background.default,
            }}
          >
            <div className="base-content" style={contentStyle}>
              {children}
            </div>
          </section>
        </div>
      </div>
    </BaseErrorBoundary>
  )
}
