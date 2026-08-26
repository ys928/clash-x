import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import * as yaml from 'js-yaml'
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { BaseSearchBox, MonacoEditor, VirtualList } from '@/components/base'
import { ProxyItem } from '@/components/profile/proxy-item'
import { readProfileFile, saveProfileFile } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import { useThemeMode } from '@/services/states'
import type { MonacoEditorInstance } from '@/types/monaco'
import getSystem from '@/utils/get-system'
import { parseYamlSafe } from '@/utils/yaml'

interface Props {
  profileUid: string
  property: string
  open: boolean
  onClose: () => void
  onSave?: (prev?: string, curr?: string) => void
}

export const ProxiesEditorViewer = (props: Props) => {
  const { profileUid, property, open, onClose, onSave } = props
  const { t } = useTranslation()
  const themeMode = useThemeMode()
  const editorRef = useRef<MonacoEditorInstance | null>(null)
  const [prevData, setPrevData] = useState('')
  const [currData, setCurrData] = useState('')
  const [visualization, setVisualization] = useState(true)
  const [match, setMatch] = useState(() => (_: string) => true)

  const [proxyList, setProxyList] = useState<IProxyConfig[]>([])
  const [prependSeq, setPrependSeq] = useState<IProxyConfig[]>([])
  const [appendSeq, setAppendSeq] = useState<IProxyConfig[]>([])
  const [deleteSeq, setDeleteSeq] = useState<string[]>([])
  const hasLoadedSeqConfigRef = useRef(false)

  // 节点的 name 会被用作 SortableContext 的 item id、React key 以及拖拽排序的
  // 依据。当 name 为空/null（例如高级模式下粘贴了缺少 name 的节点）时，
  // @dnd-kit 的 SortableContext 会对 null 执行 `'id' in item` 从而崩溃
  // （Cannot use 'in' operator to search for 'id' in null）。
  // 这里统一过滤掉没有有效 name 的节点，避免可视化编辑页崩溃；原始 YAML
  // 数据仍然保留，用户可在高级(文本)模式中查看并修正这些节点。
  const hasValidName = (proxy: IProxyConfig) =>
    typeof proxy?.name === 'string' && proxy.name.length > 0
  const filteredPrependSeq = useMemo(
    () =>
      prependSeq.filter((proxy) => hasValidName(proxy) && match(proxy.name)),
    [prependSeq, match],
  )
  const filteredProxyList = useMemo(
    () => proxyList.filter((proxy) => hasValidName(proxy) && match(proxy.name)),
    [proxyList, match],
  )
  const filteredAppendSeq = useMemo(
    () => appendSeq.filter((proxy) => hasValidName(proxy) && match(proxy.name)),
    [appendSeq, match],
  )

  const renderItem = (index: number): React.ReactNode => {
    const shift = filteredPrependSeq.length > 0 ? 1 : 0
    if (filteredPrependSeq.length > 0 && index === 0) {
      return (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onPrependDragEnd}
        >
          <SortableContext
            items={filteredPrependSeq.map((x) => {
              return x.name
            })}
          >
            {filteredPrependSeq.map((item) => {
              return (
                <ProxyItem
                  key={item.name}
                  type="prepend"
                  proxy={item}
                  onDelete={() => {
                    setPrependSeq(
                      prependSeq.filter((v) => v.name !== item.name),
                    )
                  }}
                />
              )
            })}
          </SortableContext>
        </DndContext>
      )
    } else if (index < filteredProxyList.length + shift) {
      const newIndex = index - shift
      return (
        <ProxyItem
          key={filteredProxyList[newIndex].name}
          type={
            deleteSeq.includes(filteredProxyList[newIndex].name)
              ? 'delete'
              : 'original'
          }
          proxy={filteredProxyList[newIndex]}
          onDelete={() => {
            if (deleteSeq.includes(filteredProxyList[newIndex].name)) {
              setDeleteSeq(
                deleteSeq.filter((v) => v !== filteredProxyList[newIndex].name),
              )
            } else {
              setDeleteSeq((prev) => [
                ...prev,
                filteredProxyList[newIndex].name,
              ])
            }
          }}
        />
      )
    } else {
      return (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onAppendDragEnd}
        >
          <SortableContext
            items={filteredAppendSeq.map((x) => {
              return x.name
            })}
          >
            {filteredAppendSeq.map((item) => {
              return (
                <ProxyItem
                  key={item.name}
                  type="append"
                  proxy={item}
                  onDelete={() => {
                    setAppendSeq(appendSeq.filter((v) => v.name !== item.name))
                  }}
                />
              )
            })}
          </SortableContext>
        </DndContext>
      )
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const onPrependDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (over) {
      if (active.id !== over.id) {
        let activeIndex = 0
        let overIndex = 0
        prependSeq.forEach((item, index) => {
          if (item.name === active.id) {
            activeIndex = index
          }
          if (item.name === over.id) {
            overIndex = index
          }
        })

        setPrependSeq(arrayMove(prependSeq, activeIndex, overIndex))
      }
    }
  }
  const onAppendDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (over) {
      if (active.id !== over.id) {
        let activeIndex = 0
        let overIndex = 0
        appendSeq.forEach((item, index) => {
          if (item.name === active.id) {
            activeIndex = index
          }
          if (item.name === over.id) {
            overIndex = index
          }
        })
        setAppendSeq(arrayMove(appendSeq, activeIndex, overIndex))
      }
    }
  }
  const fetchProfile = useCallback(async () => {
    const data = await readProfileFile(profileUid)

    const originProxiesObj = parseYamlSafe(data) as {
      proxies: IProxyConfig[]
    } | null

    setProxyList(originProxiesObj?.proxies || [])
  }, [profileUid])

  const fetchContent = useCallback(async () => {
    hasLoadedSeqConfigRef.current = false
    const data = await readProfileFile(property)
    const obj = parseYamlSafe(data) as ISeqProfileConfig | null | undefined

    setPrevData(data)
    setCurrData(data)

    if (obj === undefined) {
      setVisualization(false)
      return
    }

    setPrependSeq(obj?.prepend || [])
    setAppendSeq(obj?.append || [])
    setDeleteSeq(obj?.delete || [])
    hasLoadedSeqConfigRef.current = true
  }, [property])

  const handleVisualizationToggle = () => {
    if (visualization) {
      setVisualization(false)
      return
    }

    const obj = parseYamlSafe(currData) as ISeqProfileConfig | null | undefined
    if (obj === undefined) {
      hasLoadedSeqConfigRef.current = false
      return
    }

    hasLoadedSeqConfigRef.current = true
    startTransition(() => {
      setPrependSeq(obj?.prepend ?? [])
      setAppendSeq(obj?.append ?? [])
      setDeleteSeq(obj?.delete ?? [])
    })
    setVisualization(true)
  }

  useEffect(() => {
    if (
      !hasLoadedSeqConfigRef.current ||
      !(prependSeq && appendSeq && deleteSeq)
    ) {
      return
    }

    const serialize = () => {
      if (!hasLoadedSeqConfigRef.current) {
        return
      }

      try {
        setCurrData(
          yaml.dump(
            { prepend: prependSeq, append: appendSeq, delete: deleteSeq },
            { forceQuotes: true },
          ),
        )
      } catch (e) {
        console.warn('[ProxiesEditorViewer] yaml.dump failed:', e)
        // 防止异常导致UI卡死
      }
    }
    let idleId: number | undefined
    let timeoutId: number | undefined
    if (window.requestIdleCallback) {
      idleId = window.requestIdleCallback(serialize)
    } else {
      timeoutId = window.setTimeout(serialize, 0)
    }
    return () => {
      if (idleId !== undefined && window.cancelIdleCallback) {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
      }
    }
  }, [prependSeq, appendSeq, deleteSeq])

  useEffect(() => {
    if (!open) return
    fetchContent()
    fetchProfile()
  }, [fetchContent, fetchProfile, open])

  useEffect(() => {
    return () => {
      editorRef.current?.dispose()
      editorRef.current = null
    }
  }, [])

  const handleSave = useLockFn(async () => {
    try {
      if (!(await saveProfileFile(property, currData))) {
        await fetchContent()
        onClose()
        return
      }
      showNotice.success('shared.feedback.notifications.saved')
      onSave?.(prevData, currData)
      onClose()
    } catch (err) {
      showNotice.error(err)
    }
  })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xl"
      fullWidth
      disableEnforceFocus={!visualization}
    >
      <DialogTitle>
        {
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            {t('profiles.modals.proxiesEditor.title')}
            <Box>
              <Button
                variant="contained"
                size="small"
                onClick={handleVisualizationToggle}
              >
                {visualization
                  ? t('shared.editorModes.advanced')
                  : t('shared.editorModes.visualization')}
              </Button>
            </Box>
          </Box>
        }
      </DialogTitle>

      <DialogContent
        sx={{ display: 'flex', width: 'auto', height: 'calc(100vh - 185px)' }}
      >
        {visualization ? (
          <List
            sx={{
              width: '100%',
              padding: '0 10px',
            }}
          >
            <BaseSearchBox onSearch={(match) => setMatch(() => match)} />
            <VirtualList
              count={
                filteredProxyList.length +
                (filteredPrependSeq.length > 0 ? 1 : 0) +
                (filteredAppendSeq.length > 0 ? 1 : 0)
              }
              estimateSize={56}
              renderItem={renderItem}
              style={{ height: 'calc(100% - 24px)', marginTop: '8px' }}
            />
          </List>
        ) : (
          <MonacoEditor
            height="100%"
            language="yaml"
            value={currData}
            theme={themeMode === 'light' ? 'light' : 'vs-dark'}
            onMount={(editorInstance) => {
              editorRef.current = editorInstance
            }}
            options={{
              tabSize: 2, // 根据语言类型设置缩进大小
              minimap: {
                enabled: document.documentElement.clientWidth >= 1500, // 超过一定宽度显示minimap滚动条
              },
              mouseWheelZoom: true, // 按住Ctrl滚轮调节缩放比例
              quickSuggestions: {
                strings: true, // 字符串类型的建议
                comments: true, // 注释类型的建议
                other: true, // 其他类型的建议
              },
              padding: {
                top: 33, // 顶部padding防止遮挡snippets
              },
              fontFamily: `Fira Code, JetBrains Mono, Roboto Mono, "Source Code Pro", Consolas, Menlo, Monaco, monospace, "Courier New", "Apple Color Emoji"${
                getSystem() === 'windows' ? ', twemoji mozilla' : ''
              }`,
              fontLigatures: false, // 连字符
              smoothScrolling: true, // 平滑滚动
            }}
            onChange={(value) => setCurrData(value ?? '')}
          />
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="outlined">
          {t('shared.actions.cancel')}
        </Button>

        <Button onClick={handleSave} variant="contained">
          {t('shared.actions.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
