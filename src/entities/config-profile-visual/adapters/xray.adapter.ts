import type { CoreVisualAdapter } from './core-adapter.ts'

import { parseXrayConfig } from '../parse.ts'
import { applyVisualPatch } from '../patch.ts'

export const xrayVisualAdapter: CoreVisualAdapter = {
    coreType: 'xray',
    parse: parseXrayConfig,
    applyPatch: applyVisualPatch
}
