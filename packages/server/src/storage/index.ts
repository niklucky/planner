export interface Storage {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<Uint8Array | null>
  delete(key: string): Promise<void>
}

export { createLocalStorage } from './local'
