/**
 * One-shot hotfix: rewrite updater proxy manifests so downloads no longer
 * go through update.hwdns.net (returns 403 for ys928/clash-x).
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx node scripts/patch-update-proxy.mjs
 *
 * Optional:
 *   GITHUB_REPOSITORY=ys928/clash-x
 *   UPDATE_PROXY_PREFIX=https://ghfast.top/
 */
import { getOctokit } from '@actions/github'

const REPO = process.env.GITHUB_REPOSITORY || 'ys928/clash-x'
const PROXY_PREFIX = process.env.UPDATE_PROXY_PREFIX || 'https://ghfast.top/'
const UPDATE_TAG = 'updater'

const MANIFESTS = [
  { source: 'update.json', target: 'update-proxy.json' },
  {
    source: 'update-fixed-webview2.json',
    target: 'update-fixed-webview2-proxy.json',
  },
]

function rewriteProxyUrls(updateData) {
  const next = structuredClone(updateData)
  for (const [key, value] of Object.entries(next.platforms ?? {})) {
    if (!value?.url) continue
    const raw = value.url.replace(/^https:\/\/update\.hwdns\.net\//, '')
    const githubUrl = raw.startsWith('http') ? raw : value.url
    next.platforms[key].url = `${PROXY_PREFIX}${githubUrl}`
  }
  return next
}

async function main() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (!token) {
    throw new Error('GITHUB_TOKEN (or GH_TOKEN) is required')
  }

  const [owner, repo] = REPO.split('/')
  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY: ${REPO}`)
  }

  const github = getOctokit(token)
  const { data: release } = await github.rest.repos.getReleaseByTag({
    owner,
    repo,
    tag: UPDATE_TAG,
  })

  for (const { source, target } of MANIFESTS) {
    const sourceAsset = release.assets.find((asset) => asset.name === source)
    if (!sourceAsset) {
      console.log(`[skip] missing source asset: ${source}`)
      continue
    }

    const sourceRes = await fetch(sourceAsset.browser_download_url, {
      headers: {
        Accept: 'application/octet-stream',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'clash-x-patch-update-proxy',
      },
    })
    if (!sourceRes.ok) {
      throw new Error(`Failed to download ${source}: ${sourceRes.status}`)
    }

    const updateData = rewriteProxyUrls(await sourceRes.json())
    const body = JSON.stringify(updateData, null, 2)

    const existing = release.assets.find((asset) => asset.name === target)
    if (existing) {
      await github.rest.repos.deleteReleaseAsset({
        owner,
        repo,
        asset_id: existing.id,
      })
      console.log(`[delete] ${target}`)
    }

    await github.rest.repos.uploadReleaseAsset({
      owner,
      repo,
      release_id: release.id,
      name: target,
      data: body,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    })
    console.log(`[upload] ${target} (prefix=${PROXY_PREFIX})`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
