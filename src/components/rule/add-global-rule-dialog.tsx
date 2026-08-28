import {
  AddRounded,
  VerticalAlignBottomRounded,
  VerticalAlignTopRounded,
} from '@mui/icons-material'
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  alpha,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Switch } from '@/components/base'
import { useProxiesData } from '@/providers/app-data-context'
import { showNotice } from '@/services/notice-service'
import type { TranslationKey } from '@/types/generated/i18n-keys'
import getSystem from '@/utils/get-system'
import { addGlobalRule, addGlobalRules } from '@/utils/global-rules'
import { isValidIpCidr } from '@/utils/network'

interface Props {
  open: boolean
  onClose: () => void
  onSaved?: () => void | Promise<void>
}

type RuleTypeDef = {
  name: string
  required?: boolean
  example?: string
  noResolve?: boolean
  validator?: (value: string) => boolean
}

const LAN_DIRECT_PRESETS = [
  'IP-CIDR,127.0.0.0/8,DIRECT,no-resolve',
  'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve',
  'IP-CIDR,172.16.0.0/12,DIRECT,no-resolve',
  'IP-CIDR,192.168.0.0/16,DIRECT,no-resolve',
  'IP-CIDR,169.254.0.0/16,DIRECT,no-resolve',
  'IP-CIDR6,fc00::/7,DIRECT,no-resolve',
  'IP-CIDR6,fe80::/10,DIRECT,no-resolve',
] as const

const portValidator = (value: string) =>
  /^(?:[1-9]\d{0,3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5])$/.test(
    value,
  )

const RULE_TYPES: RuleTypeDef[] = [
  { name: 'DOMAIN', example: 'example.com' },
  { name: 'DOMAIN-SUFFIX', example: 'example.com' },
  { name: 'DOMAIN-KEYWORD', example: 'example' },
  { name: 'DOMAIN-REGEX', example: 'example.*' },
  { name: 'GEOSITE', example: 'youtube' },
  { name: 'GEOIP', example: 'CN', noResolve: true },
  {
    name: 'IP-CIDR',
    example: '127.0.0.0/8',
    noResolve: true,
    validator: isValidIpCidr,
  },
  {
    name: 'IP-CIDR6',
    example: '2620:0:2d0:200::7/32',
    noResolve: true,
    validator: isValidIpCidr,
  },
  {
    name: 'PROCESS-NAME',
    example: getSystem() === 'windows' ? 'chrome.exe' : 'curl',
  },
  {
    name: 'PROCESS-PATH',
    example:
      getSystem() === 'windows'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : '/usr/bin/wget',
  },
  { name: 'DST-PORT', example: '80', validator: portValidator },
  { name: 'SRC-PORT', example: '7777', validator: portValidator },
  { name: 'RULE-SET', example: 'providername', noResolve: true },
  { name: 'MATCH', required: false },
]

const BUILTIN_POLICIES = ['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS'] as const

const fieldSx = {
  '& .MuiInputBase-root': { minHeight: 40, borderRadius: 1.5 },
  '& .MuiInputBase-input': { fontSize: 13 },
} as const

export const AddGlobalRuleDialog = ({ open, onClose, onSaved }: Props) => {
  const { t } = useTranslation()
  const { proxyView } = useProxiesData()

  const [ruleType, setRuleType] = useState<RuleTypeDef>(RULE_TYPES[0])
  const [ruleContent, setRuleContent] = useState('')
  const [proxyPolicy, setProxyPolicy] = useState<string>(BUILTIN_POLICIES[0])
  const [noResolve, setNoResolve] = useState(false)
  const [position, setPosition] = useState<'prepend' | 'append'>('prepend')
  const [domainDraft, setDomainDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const proxyPolicyList = useMemo(() => {
    const groups = proxyView?.groups.map((g) => g.name) ?? []
    return [...BUILTIN_POLICIES, ...groups.filter(Boolean)]
  }, [proxyView])

  const buildRule = () => {
    if ((ruleType.required ?? true) && !ruleContent.trim()) {
      throw new Error(
        t('rules.modals.editor.form.validation.conditionRequired'),
      )
    }
    if (ruleType.validator && !ruleType.validator(ruleContent.trim())) {
      throw new Error(t('rules.modals.editor.form.validation.invalidRule'))
    }

    const condition = (ruleType.required ?? true) ? ruleContent.trim() : ''
    return `${ruleType.name}${condition ? `,${condition}` : ''},${proxyPolicy}${
      ruleType.noResolve && noResolve ? ',no-resolve' : ''
    }`
  }

  const finishSave = async () => {
    await onSaved?.()
    onClose()
  }

  const handleAdd = useLockFn(async () => {
    setSaving(true)
    try {
      const raw = buildRule()
      const result = await addGlobalRule(raw, position)
      if (result === 'duplicate') {
        showNotice.info('rules.modals.add.feedback.duplicate')
        return
      }
      if (result === 'invalid') {
        showNotice.error('rules.modals.add.feedback.failed')
        return
      }
      showNotice.success('shared.feedback.notifications.saved')
      await finishSave()
    } catch (err) {
      showNotice.error(err)
    } finally {
      setSaving(false)
    }
  })

  const handleLanPreset = useLockFn(async () => {
    setSaving(true)
    try {
      const result = await addGlobalRules([...LAN_DIRECT_PRESETS], 'prepend')
      if (result === 'noop') {
        showNotice.info('rules.modals.add.feedback.duplicate')
        return
      }
      if (result === 'invalid') {
        showNotice.error('rules.modals.add.feedback.failed')
        return
      }
      showNotice.success('rules.modals.editor.presets.lanAdded')
      await finishSave()
    } catch (err) {
      showNotice.error(err)
    } finally {
      setSaving(false)
    }
  })

  const handleDomainDirect = useLockFn(async () => {
    const domain = domainDraft.trim().replace(/^\.+/, '')
    if (!domain) {
      showNotice.error('rules.modals.editor.form.validation.conditionRequired')
      return
    }
    setSaving(true)
    try {
      const raw = `DOMAIN-SUFFIX,${domain},DIRECT`
      const result = await addGlobalRule(raw, 'prepend')
      if (result === 'duplicate') {
        showNotice.info('rules.modals.add.feedback.duplicate')
        setDomainDraft('')
        return
      }
      if (result === 'invalid') {
        showNotice.error('rules.modals.add.feedback.failed')
        return
      }
      showNotice.success('shared.feedback.notifications.saved')
      await finishSave()
    } catch (err) {
      showNotice.error(err)
    } finally {
      setSaving(false)
    }
  })

  const typeLabel = (name: string) =>
    t(`rules.modals.editor.ruleTypes.${name}` as TranslationKey)

  const policyLabel = (policy: string) => {
    const key = `proxies.components.enums.policies.${policy}` as TranslationKey
    const translated = t(key)
    return translated === key ? policy : translated
  }

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2.5,
            overflow: 'hidden',
          },
        },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <Box
            sx={(theme) => ({
              mt: 0.25,
              width: 36,
              height: 36,
              borderRadius: 1.5,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              bgcolor: alpha(
                theme.palette.primary.main,
                theme.palette.mode === 'light' ? 0.1 : 0.2,
              ),
              color: 'primary.main',
            })}
          >
            <AddRounded fontSize="small" />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" component="div" sx={{ fontWeight: 700 }}>
              {t('rules.modals.add.title')}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.35, lineHeight: 1.45 }}
            >
              {t('rules.modals.editor.globalHint')}
            </Typography>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 1.5, pb: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
          <Box>
            <FieldLabel>{t('rules.modals.add.position')}</FieldLabel>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              value={position}
              onChange={(_, next) => {
                if (next) setPosition(next)
              }}
              sx={{
                mt: 0.75,
                '& .MuiToggleButton-root': {
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: 13,
                  py: 0.85,
                  borderRadius: 1.5,
                  borderColor: 'divider',
                },
              }}
            >
              <ToggleButton value="prepend">
                <VerticalAlignTopRounded sx={{ mr: 0.75, fontSize: 18 }} />
                {t('rules.modals.editor.form.actions.prependRule')}
              </ToggleButton>
              <ToggleButton value="append">
                <VerticalAlignBottomRounded sx={{ mr: 0.75, fontSize: 18 }} />
                {t('rules.modals.editor.form.actions.appendRule')}
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box>
            <FieldLabel>{t('rules.modals.editor.form.labels.type')}</FieldLabel>
            <Select
              size="small"
              fullWidth
              value={ruleType.name}
              onChange={(e) => {
                const next = RULE_TYPES.find(
                  (item) => item.name === e.target.value,
                )
                if (!next) return
                setRuleType(next)
                setRuleContent('')
                setNoResolve(false)
              }}
              sx={{
                mt: 0.75,
                ...fieldSx,
                '& .MuiSelect-select': {
                  display: 'flex',
                  alignItems: 'center',
                  py: '9px',
                  fontSize: 13,
                },
              }}
              MenuProps={{
                slotProps: {
                  paper: {
                    sx: {
                      maxHeight: 360,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      mt: 0.75,
                    },
                  },
                },
              }}
            >
              {RULE_TYPES.map((item) => (
                <MenuItem
                  key={item.name}
                  value={item.name}
                  sx={{
                    mx: 0.5,
                    px: 1.25,
                    py: 0.85,
                    minHeight: 36,
                    borderRadius: 1.25,
                    fontSize: 13,
                  }}
                >
                  {typeLabel(item.name)}
                </MenuItem>
              ))}
            </Select>
          </Box>

          {(ruleType.required ?? true) && (
            <Box>
              <FieldLabel>
                {t('rules.modals.editor.form.labels.content')}
              </FieldLabel>
              <TextField
                size="small"
                fullWidth
                autoFocus
                value={ruleContent}
                placeholder={ruleType.example}
                error={!ruleContent.trim()}
                onChange={(e) => setRuleContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleAdd()
                  }
                }}
                sx={{ mt: 0.75, ...fieldSx }}
              />
            </Box>
          )}

          <Box>
            <FieldLabel>
              {t('rules.modals.editor.form.labels.proxyPolicy')}
            </FieldLabel>
            <Autocomplete
              size="small"
              sx={{ mt: 0.75, ...fieldSx }}
              options={proxyPolicyList}
              value={proxyPolicy}
              disableClearable
              freeSolo
              getOptionLabel={(option) => policyLabel(String(option))}
              onChange={(_, value) => {
                if (value) setProxyPolicy(String(value))
              }}
              onInputChange={(_, value, reason) => {
                if (reason === 'input') setProxyPolicy(value)
              }}
              renderInput={(params) => <TextField {...params} />}
            />
          </Box>

          {ruleType.noResolve && (
            <FormControlLabel
              sx={{
                mx: 0,
                px: 1.25,
                py: 0.5,
                borderRadius: 1.5,
                border: '1px solid',
                borderColor: 'divider',
                justifyContent: 'space-between',
              }}
              labelPlacement="start"
              control={
                <Switch
                  checked={noResolve}
                  onChange={() => setNoResolve((v) => !v)}
                />
              }
              label={
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {t('rules.modals.editor.form.toggles.noResolve')}
                </Typography>
              }
            />
          )}

          <Box
            sx={(theme) => ({
              p: 1.5,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: alpha(
                theme.palette.primary.main,
                theme.palette.mode === 'light' ? 0.03 : 0.08,
              ),
            })}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 700, letterSpacing: 0.2 }}
            >
              {t('rules.modals.editor.presets.title')}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
              <Chip
                size="small"
                color="primary"
                variant="outlined"
                label={t('rules.modals.editor.presets.lanDirect')}
                onClick={() => {
                  void handleLanPreset()
                }}
                disabled={saving}
                sx={{ height: 28, fontWeight: 600 }}
              />
            </Box>
            <Box
              sx={{
                display: 'flex',
                gap: 1,
                alignItems: 'center',
                mt: 1.25,
              }}
            >
              <TextField
                size="small"
                fullWidth
                value={domainDraft}
                disabled={saving}
                placeholder={t('rules.modals.editor.presets.domainPlaceholder')}
                onChange={(e) => setDomainDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleDomainDirect()
                  }
                }}
                sx={fieldSx}
              />
              <Button
                size="small"
                variant="outlined"
                disabled={saving || !domainDraft.trim()}
                onClick={() => {
                  void handleDomainDirect()
                }}
                sx={{ minHeight: 40, whiteSpace: 'nowrap', borderRadius: 1.5 }}
              >
                {t('rules.modals.editor.presets.addDomainDirect')}
              </Button>
            </Box>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button
          onClick={onClose}
          variant="outlined"
          disabled={saving}
          sx={{ borderRadius: 1.5 }}
        >
          {t('shared.actions.cancel')}
        </Button>
        <Button
          onClick={() => {
            void handleAdd()
          }}
          variant="contained"
          loading={saving}
          startIcon={<AddRounded />}
          sx={{ borderRadius: 1.5, fontWeight: 700, px: 2 }}
        >
          {t('rules.modals.add.submit')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

const FieldLabel = ({ children }: { children: ReactNode }) => (
  <Typography
    variant="caption"
    color="text.secondary"
    sx={{ fontWeight: 700, letterSpacing: 0.15 }}
  >
    {children}
  </Typography>
)
