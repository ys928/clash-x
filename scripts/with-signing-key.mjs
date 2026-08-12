import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { log_error, log_info } from './utils.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const keyPath = path.join(root, '.tauri', 'signing.key')
const passwordPath = path.join(root, '.tauri', 'signing.key.password')

function quoteShellArg(arg) {
  if (arg === '') return '""'
  if (!/[\s"'\\]/u.test(arg)) return arg
  return `"${arg.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function loadSigningEnv() {
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
    if (!fs.existsSync(keyPath)) {
      log_error(
        `Missing updater signing key: ${keyPath}\n` +
          'Generate one with:\n' +
          '  pnpm tauri signer generate -w .tauri/signing.key -p "" --ci -f\n' +
          'Then copy the public key into src-tauri/tauri.conf.json (and webview2.*.json).',
      )
      process.exit(1)
    }
    process.env.TAURI_SIGNING_PRIVATE_KEY = fs
      .readFileSync(keyPath, 'utf8')
      .trim()
    log_info('Loaded TAURI_SIGNING_PRIVATE_KEY from .tauri/signing.key')
  }

  if (!process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
    if (fs.existsSync(passwordPath)) {
      process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = fs
        .readFileSync(passwordPath, 'utf8')
        .trim()
    } else {
      // Empty-password keys still need the env var present for some Tauri versions.
      process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
    }
  }
}

const args = process.argv.slice(2)
if (args.length === 0) {
  log_error('Usage: node scripts/with-signing-key.mjs <command> [...args]')
  process.exit(1)
}

loadSigningEnv()

const commandLine = args.map(quoteShellArg).join(' ')
const child = spawn(commandLine, {
  stdio: 'inherit',
  env: process.env,
  shell: true,
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
