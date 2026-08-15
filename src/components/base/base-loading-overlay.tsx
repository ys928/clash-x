import { Box, CircularProgress, alpha } from '@mui/material'

interface BaseLoadingOverlayProps {
  isLoading: boolean
}

export const BaseLoadingOverlay: React.FC<BaseLoadingOverlayProps> = ({
  isLoading,
}) => {
  if (!isLoading) return null

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: (theme) =>
          alpha(
            theme.palette.background.default,
            theme.palette.mode === 'dark' ? 0.72 : 0.7,
          ),
        zIndex: 1000,
      }}
    >
      <CircularProgress />
    </Box>
  )
}
