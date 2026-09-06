import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, normalize } from 'node:path'
import type { Storage } from './index'

/** Files on the local disk under `root`. Keys are relative paths we generate ourselves. */
export function createLocalStorage(root: string): Storage {
  function pathFor(key: string) {
    const rel = normalize(key)
    if (rel.startsWith('..') || rel.includes('\0')) throw new Error(`Invalid storage key: ${key}`)
    return join(root, rel)
  }
  return {
    async put(key, data) {
      const path = pathFor(key)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, data)
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(pathFor(key)))
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw e
      }
    },
    async delete(key) {
      await rm(pathFor(key), { force: true })
    },
  }
}
