import type { ConcurrentProfileBindings } from '@features/dashboard/nodes/config-profile-selection/model/concurrent-profile-selection'

import { GetConfigProfilesCommand } from '@remnawave/backend-contract'
import { ReactNode } from 'react'

export interface IProps {
    activeConfigProfiles: ConcurrentProfileBindings
    configProfiles: GetConfigProfilesCommand.Response['response']['configProfiles']
    errors?: ReactNode
    onSaveInbounds: (bindings: ConcurrentProfileBindings) => void
}
