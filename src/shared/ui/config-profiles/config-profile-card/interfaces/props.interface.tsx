import type { InputBaseProps } from '@mantine/core'

import { GetConfigProfilesCommand } from '@remnawave/backend-contract'

import type { ConfigProfileListItemWithCoreType } from '@shared/api/types/config-profile.type'

export interface IProps extends InputBaseProps {
    hideSelectActions?: boolean
    isOpen: boolean
    onInboundToggle: (
        inbound: GetConfigProfilesCommand.Response['response']['configProfiles'][number]['inbounds'][number]
    ) => void
    onSelectAllInbounds: (profileUuid: string) => void
    onUnselectAllInbounds: (profileUuid: string) => void
    profile: ConfigProfileListItemWithCoreType
    selectedInbounds: Set<string>
}
