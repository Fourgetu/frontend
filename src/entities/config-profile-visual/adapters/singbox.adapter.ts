import type { CoreVisualAdapter } from './core-adapter.ts'

import { parseSingboxConfig } from '../parse.ts'
import { applyVisualPatch } from '../patch.ts'

export const singboxVisualAdapter: CoreVisualAdapter = {
    coreType: 'singbox',
    parse: parseSingboxConfig,
    applyPatch: applyVisualPatch
}
