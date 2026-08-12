import { InfoRounded } from '@mui/icons-material'
import { IconButton, IconButtonProps, SvgIconProps } from '@mui/material'

import { BaseTooltip } from './base-tooltip'

interface Props extends IconButtonProps {
  title?: string
  icon?: React.ElementType<SvgIconProps>
}

export const TooltipIcon: React.FC<Props> = (props: Props) => {
  const { title = '', icon: Icon = InfoRounded, ...restProps } = props

  return (
    <BaseTooltip title={title}>
      <IconButton color="inherit" size="small" {...restProps}>
        <Icon fontSize="inherit" style={{ cursor: 'pointer', opacity: 0.75 }} />
      </IconButton>
    </BaseTooltip>
  )
}
