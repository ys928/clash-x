import { CheckRounded, ExpandMoreRounded } from '@mui/icons-material'
import { Button, Menu, MenuItem } from '@mui/material'
import { useState } from 'react'

import { supportedLanguages } from '@/services/i18n'

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  zh: '简体中文',
  zhtw: '繁體中文',
}

const languageOptions = supportedLanguages.map((code) => ({
  code,
  label: LANGUAGE_LABELS[code] || code,
}))

interface Props {
  value?: string
  onChange?: (value: string) => void
}

export const LanguageSelect = ({ value = 'en', onChange }: Props) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const open = Boolean(anchorEl)
  const currentLabel =
    languageOptions.find((option) => option.code === value)?.label ?? value

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        disableElevation
        aria-haspopup="listbox"
        aria-expanded={open}
        endIcon={
          <ExpandMoreRounded
            sx={{
              fontSize: 18,
              transition: 'transform 0.2s',
              transform: open ? 'rotate(180deg)' : 'none',
            }}
          />
        }
        onClick={(event) => setAnchorEl(event.currentTarget)}
        sx={{
          height: 30,
          minWidth: 0,
          px: 1.25,
          py: 0,
          textTransform: 'none',
          fontWeight: 500,
          fontSize: '0.8125rem',
          lineHeight: 1.2,
          borderRadius: 1.5,
          '& .MuiButton-endIcon': { ml: 0.5, mr: -0.25 },
        }}
      >
        {currentLabel}
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            elevation: 3,
            sx: {
              mt: 0.75,
              minWidth: 168,
              maxHeight: 320,
              borderRadius: 2,
              overflow: 'hidden',
              border: '1px solid',
              borderColor: 'divider',
            },
          },
          list: {
            dense: true,
            role: 'listbox',
            sx: { py: 0.5 },
          },
        }}
      >
        {languageOptions.map(({ code, label }) => {
          const selected = code === value
          return (
            <MenuItem
              key={code}
              selected={selected}
              onClick={() => {
                onChange?.(code)
                setAnchorEl(null)
              }}
              sx={{
                mx: 0.5,
                px: 1.25,
                py: 0.75,
                minHeight: 34,
                borderRadius: 1.25,
                fontSize: '0.8125rem',
                gap: 1.5,
                '&.Mui-selected': {
                  bgcolor: 'action.selected',
                },
                '&.Mui-selected:hover': {
                  bgcolor: 'action.selected',
                },
              }}
            >
              <span style={{ flex: 1 }}>{label}</span>
              {selected ? (
                <CheckRounded sx={{ fontSize: 16, color: 'primary.main' }} />
              ) : (
                <span style={{ width: 16 }} />
              )}
            </MenuItem>
          )
        })}
      </Menu>
    </>
  )
}
