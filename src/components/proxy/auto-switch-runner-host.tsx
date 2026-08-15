import { useAutoSwitchRunner } from '@/hooks/use-auto-switch-runner'

/** Keeps curated auto-switch groups running while the app shell is mounted. */
export function AutoSwitchRunnerHost() {
  useAutoSwitchRunner()
  return null
}
