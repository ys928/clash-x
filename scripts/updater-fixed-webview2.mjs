import { context, getOctokit } from '@actions/github'

import { resolveUpdateLog, resolveUpdateLogDefault } from './updatelog.mjs'

const UPDATE_TAG_NAME = 'updater'
const UPDATE_JSON_FILE = 'update-fixed-webview2.json'
const UPDATE_JSON_PROXY = 'update-fixed-webview2-proxy.json'
const STABLE_TAG_REGEX = /^v\d+\.\d+\.\d+$/

/// generate update-fixed-webview2.json
/// upload to update tag's release asset
async function resolveUpdater() {
  if (process.env.GITHUB_TOKEN === undefined) {
    throw new Error('GITHUB_TOKEN is required')
  }

  const options = { owner: context.repo.owner, repo: context.repo.repo }
  const github = getOctokit(process.env.GITHUB_TOKEN)

  const currentTag = process.env.GITHUB_REF_NAME
  let tagName = null

  if (currentTag && STABLE_TAG_REGEX.test(currentTag)) {
    tagName = currentTag
  } else {
    const { data: tags } = await github.rest.repos.listTags({
      ...options,
      per_page: 100,
      page: 1,
    })
    const tag = tags.find((t) => STABLE_TAG_REGEX.test(t.name))
    tagName = tag?.name ?? null
  }

  if (!tagName) {
    throw new Error('No stable release tag (vX.Y.Z) found for fixed-webview2 updater')
  }

  console.log('Stable tag:', tagName)
  console.log()

  const { data: latestRelease } = await github.rest.repos.getReleaseByTag({
    ...options,
    tag: tagName,
  })

  const updateData = {
    name: tagName,
    notes: await resolveUpdateLog(tagName).catch(() =>
      resolveUpdateLogDefault().catch(() => 'No changelog available'),
    ),
    pub_date: new Date().toISOString(),
    platforms: {
      'windows-x86_64': { signature: '', url: '' },
      'windows-aarch64': { signature: '', url: '' },
      'windows-x86': { signature: '', url: '' },
      'windows-i686': { signature: '', url: '' },
    },
  }

  const promises = latestRelease.assets.map(async (asset) => {
    const { name, browser_download_url } = asset

    // win64 url
    if (name.endsWith('x64_fixed_webview2-setup.exe')) {
      updateData.platforms['windows-x86_64'].url = browser_download_url
    }
    // win64 signature
    if (name.endsWith('x64_fixed_webview2-setup.exe.sig')) {
      const sig = await getSignature(browser_download_url)
      updateData.platforms['windows-x86_64'].signature = sig
    }

    // win32 url
    if (name.endsWith('x86_fixed_webview2-setup.exe')) {
      updateData.platforms['windows-x86'].url = browser_download_url
      updateData.platforms['windows-i686'].url = browser_download_url
    }
    // win32 signature
    if (name.endsWith('x86_fixed_webview2-setup.exe.sig')) {
      const sig = await getSignature(browser_download_url)
      updateData.platforms['windows-x86'].signature = sig
      updateData.platforms['windows-i686'].signature = sig
    }

    // win arm url
    if (name.endsWith('arm64_fixed_webview2-setup.exe')) {
      updateData.platforms['windows-aarch64'].url = browser_download_url
    }
    // win arm signature
    if (name.endsWith('arm64_fixed_webview2-setup.exe.sig')) {
      const sig = await getSignature(browser_download_url)
      updateData.platforms['windows-aarch64'].signature = sig
    }
  })

  await Promise.allSettled(promises)
  console.log(updateData)

  // maybe should test the signature as well
  // delete the null field
  Object.entries(updateData.platforms).forEach(([key, value]) => {
    if (!value.url) {
      console.log(`[Error]: failed to parse release for "${key}"`)
      delete updateData.platforms[key]
    }
  })

  // Generate a proxy update file for accelerated GitHub resources
  const updateDataNew = JSON.parse(JSON.stringify(updateData))

  Object.entries(updateDataNew.platforms).forEach(([key, value]) => {
    if (value.url) {
      updateDataNew.platforms[key].url = `https://update.hwdns.net/${value.url}`
    } else {
      console.log(`[Error]: updateDataNew.platforms.${key} is null`)
    }
  })

  let updateRelease
  try {
    const response = await github.rest.repos.getReleaseByTag({
      ...options,
      tag: UPDATE_TAG_NAME,
    })
    updateRelease = response.data
    console.log(`Found existing ${UPDATE_TAG_NAME} release with ID: ${updateRelease.id}`)
  } catch (error) {
    if (error.status === 404) {
      console.log(
        `Release with tag ${UPDATE_TAG_NAME} not found, creating new release...`,
      )
      const createResponse = await github.rest.repos.createRelease({
        ...options,
        tag_name: UPDATE_TAG_NAME,
        name: 'Auto-update Stable Channel',
        body: 'This release contains the update information for stable channel.',
        prerelease: false,
      })
      updateRelease = createResponse.data
      console.log(
        `Created new ${UPDATE_TAG_NAME} release with ID: ${updateRelease.id}`,
      )
    } else {
      throw error
    }
  }

  // delete the old assets
  for (const asset of updateRelease.assets) {
    if (asset.name === UPDATE_JSON_FILE) {
      await github.rest.repos.deleteReleaseAsset({
        ...options,
        asset_id: asset.id,
      })
    }

    if (asset.name === UPDATE_JSON_PROXY) {
      await github.rest.repos
        .deleteReleaseAsset({ ...options, asset_id: asset.id })
        .catch(console.error) // do not break the pipeline
    }
  }

  // upload new assets
  await github.rest.repos.uploadReleaseAsset({
    ...options,
    release_id: updateRelease.id,
    name: UPDATE_JSON_FILE,
    data: JSON.stringify(updateData, null, 2),
  })

  await github.rest.repos.uploadReleaseAsset({
    ...options,
    release_id: updateRelease.id,
    name: UPDATE_JSON_PROXY,
    data: JSON.stringify(updateDataNew, null, 2),
  })

  console.log(
    `Successfully uploaded fixed-webview2 update files to ${UPDATE_TAG_NAME}`,
  )
}

// get the signature file content
async function getSignature(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/octet-stream' },
  })

  return response.text()
}

resolveUpdater().catch((error) => {
  console.error(error)
  process.exit(1)
})
