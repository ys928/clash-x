import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { MihomoWebSocket } from 'tauri-plugin-mihomo-api'

const CONNECTION_UPDATE_THROTTLE_MS = 500
const CONNECTION_RECONNECT_DELAY_MS = 1_000

interface ConnectionSummaryData {
  activeConnectionCount: number
}

type ConnectionListener = () => void

const initConnSummaryData: ConnectionSummaryData = {
  activeConnectionCount: 0,
}

let connectionSummary: ConnectionSummaryData = initConnSummaryData
let connectionSocket: MihomoWebSocket | null = null
let connectionConnecting = false
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null
let pendingMessageData: string | null = null
let lastFlushAt = 0

const summaryListeners = new Set<ConnectionListener>()

const notifySummaryListeners = () => {
  summaryListeners.forEach((listener) => listener())
}

const hasConnectionSubscribers = () => summaryListeners.size > 0

const mergeConnectionSummary = (
  payload: IConnections,
): ConnectionSummaryData => ({
  activeConnectionCount: payload.connections?.length ?? 0,
})

const flushPendingMessage = () => {
  flushTimer = null
  const messageData = pendingMessageData
  pendingMessageData = null
  if (!messageData || !hasConnectionSubscribers()) return

  let payload: IConnections
  try {
    payload = JSON.parse(messageData) as IConnections
  } catch (err) {
    console.error('[Connections] Failed to parse websocket payload', err)
    return
  }

  lastFlushAt = Date.now()
  connectionSummary = mergeConnectionSummary(payload)
  notifySummaryListeners()
}

const enqueueConnectionMessage = (messageData: string) => {
  pendingMessageData = messageData
  if (flushTimer) return

  const elapsed = Date.now() - lastFlushAt
  if (elapsed >= CONNECTION_UPDATE_THROTTLE_MS) {
    flushPendingMessage()
    return
  }

  flushTimer = window.setTimeout(
    flushPendingMessage,
    CONNECTION_UPDATE_THROTTLE_MS - elapsed,
  )
}

const clearReconnectTimer = () => {
  if (!reconnectTimer) return
  window.clearTimeout(reconnectTimer)
  reconnectTimer = null
}

const closeConnectionSocket = async () => {
  const socket = connectionSocket
  connectionSocket = null
  if (!socket) return

  try {
    await socket.close()
  } catch (err) {
    console.warn('Failed to close connection websocket', err)
  }
}

const scheduleReconnect = () => {
  if (!hasConnectionSubscribers()) return
  if (reconnectTimer) return
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    void connectConnectionSocket()
  }, CONNECTION_RECONNECT_DELAY_MS)
}

async function reconnectConnectionSocket() {
  if (!hasConnectionSubscribers()) return
  await closeConnectionSocket()
  scheduleReconnect()
}

async function connectConnectionSocket() {
  if (connectionSocket || connectionConnecting) return
  if (!hasConnectionSubscribers()) return

  clearReconnectTimer()
  connectionConnecting = true

  try {
    const socket = await MihomoWebSocket.connect_connections()
    if (!hasConnectionSubscribers()) {
      await socket.close()
      return
    }
    connectionSocket = socket
    socket.addListener((message) => {
      if (connectionSocket !== socket) return
      if (message.type !== 'Text') return
      if (message.data.startsWith('Websocket error')) {
        void reconnectConnectionSocket()
        return
      }

      enqueueConnectionMessage(message.data)
    })
  } catch {
    scheduleReconnect()
  } finally {
    connectionConnecting = false
  }
}

const startConnectionMonitor = () => {
  void connectConnectionSocket()
}

const stopConnectionMonitorIfIdle = () => {
  if (hasConnectionSubscribers()) return

  clearReconnectTimer()
  pendingMessageData = null
  if (flushTimer) {
    window.clearTimeout(flushTimer)
    flushTimer = null
  }
  void closeConnectionSocket()
}

const getConnectionSummarySnapshot = () => connectionSummary

const subscribeConnectionSummary = (listener: ConnectionListener) => {
  summaryListeners.add(listener)
  startConnectionMonitor()
  return () => {
    summaryListeners.delete(listener)
    stopConnectionMonitorIfIdle()
  }
}

const refreshConnectionData = () => {
  pendingMessageData = null
  if (flushTimer) {
    window.clearTimeout(flushTimer)
    flushTimer = null
  }

  void reconnectConnectionSocket()
}

export const useConnectionSummaryData = (options?: { enabled?: boolean }) => {
  const enabled = options?.enabled ?? true
  const subscribe = useCallback(
    (listener: ConnectionListener) =>
      enabled ? subscribeConnectionSummary(listener) : () => {},
    [enabled],
  )
  const data = useSyncExternalStore(
    subscribe,
    getConnectionSummarySnapshot,
    getConnectionSummarySnapshot,
  )
  const response = useMemo(() => ({ data }), [data])
  const refreshGetClashConnectionSummary = useCallback(() => {
    refreshConnectionData()
  }, [])

  return {
    response,
    refreshGetClashConnectionSummary,
  }
}
