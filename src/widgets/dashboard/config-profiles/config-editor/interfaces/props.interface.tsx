import { GetSnippetsCommand } from '@remnawave/backend-contract'

import type { ConfigProfileWithCoreType } from '@shared/api/types'

export interface IProps {
    initialMode?: 'json' | 'visual'
    configProfile: ConfigProfileWithCoreType
    isWasmCrashed: boolean
    isWasmRestarting: boolean
    onRestartWasm: () => void
    snippets: GetSnippetsCommand.Response['response']
}
