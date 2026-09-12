import { GetNodesCommand } from '@remnawave/backend-contract'

export interface IProps {
    disableReordering?: boolean
    handleViewNode: (nodeUuid: string) => void
    index: number
    isDragOverlay?: boolean
    isMobile: boolean
    node: GetNodesCommand.Response['response'][number] & {
        runtimeHealth?: null | {
            observedAt: string
            xray: {
                status: 'running' | 'stopped' | 'unavailable' | 'unknown'
                version: string | null
            }
            singbox: {
                status: 'running' | 'stopped' | 'unavailable' | 'unknown'
                version: string | null
            }
            gost: {
                status: 'running' | 'stopped' | 'unavailable' | 'unknown'
                version: string | null
                installed: boolean | null
                services: number | null
            }
        }
    }
    integrationsNames: string[]
    pluginsName: string | undefined
}
