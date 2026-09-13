import type { NotaMentorApi } from './index'

declare global {
  interface Window {
    notamentor: NotaMentorApi
  }
}

export {}
