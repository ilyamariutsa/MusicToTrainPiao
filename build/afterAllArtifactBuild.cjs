'use strict'

const { copyFileSync, existsSync } = require('fs')
const { join } = require('path')

/** Copies the installer next to the unpacked app so everything lives in one folder. */
module.exports = async function afterAllArtifactBuild(context) {
  const setup = (context.artifactPaths || []).find(
    (file) => /NotaMentor-Setup-.+\.exe$/.test(file) && !file.endsWith('.blockmap')
  )
  const unpacked = join(context.outDir, 'win-unpacked')
  if (setup && existsSync(unpacked)) {
    copyFileSync(setup, join(unpacked, 'NotaMentor-Setup.exe'))
  }
  return []
}
