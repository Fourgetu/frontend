import type { NodeProfileBinding } from '@shared/api/types/concurrent-node.schema'
import type { ConfigProfileCoreType } from '@shared/api/types/config-profile.type'

export interface ConcurrentProfileBindings {
    configProfile: NodeProfileBinding | null
    singBoxConfigProfile: NodeProfileBinding | null
}

export interface CoreProfileSelection {
    inboundUuids: Set<string>
    profileUuid: null | string
}

export type ConcurrentProfileSelectionState = Record<ConfigProfileCoreType, CoreProfileSelection>

interface ConcurrentNodeConfigProfile {
    activeConfigProfileUuid: null | string
    activeInbounds: Array<{ profileUuid: string; uuid: string }>
    activeSingBoxConfigProfileUuid: null | string
}

const emptySelection = (): CoreProfileSelection => ({
    inboundUuids: new Set(),
    profileUuid: null
})

const fromBinding = (binding: NodeProfileBinding | null): CoreProfileSelection =>
    binding
        ? {
              inboundUuids: new Set(binding.activeInbounds),
              profileUuid: binding.activeConfigProfileUuid
          }
        : emptySelection()

export const createConcurrentProfileSelection = (
    bindings: ConcurrentProfileBindings
): ConcurrentProfileSelectionState => ({
    xray: fromBinding(bindings.configProfile),
    singbox: fromBinding(bindings.singBoxConfigProfile)
})

export const createConcurrentProfileBindingsFromNode = (
    nodeConfigProfile: ConcurrentNodeConfigProfile
): ConcurrentProfileBindings => {
    const createBinding = (profileUuid: null | string): NodeProfileBinding | null =>
        profileUuid
            ? {
                  activeConfigProfileUuid: profileUuid,
                  activeInbounds: nodeConfigProfile.activeInbounds
                      .filter((inbound) => inbound.profileUuid === profileUuid)
                      .map((inbound) => inbound.uuid)
              }
            : null

    return {
        configProfile: createBinding(nodeConfigProfile.activeConfigProfileUuid),
        singBoxConfigProfile: createBinding(nodeConfigProfile.activeSingBoxConfigProfileUuid)
    }
}

export const getSelectedInboundUuids = (state: ConcurrentProfileSelectionState): Set<string> =>
    new Set([...state.xray.inboundUuids, ...state.singbox.inboundUuids])

export const toggleCoreProfileInbound = (
    state: ConcurrentProfileSelectionState,
    input: {
        coreType: ConfigProfileCoreType
        inboundUuid: string
        profileUuid: string
    }
): ConcurrentProfileSelectionState => {
    const current = state[input.coreType]
    const inboundUuids =
        current.profileUuid === input.profileUuid
            ? new Set(current.inboundUuids)
            : new Set<string>()

    if (inboundUuids.has(input.inboundUuid)) inboundUuids.delete(input.inboundUuid)
    else inboundUuids.add(input.inboundUuid)

    return {
        ...state,
        [input.coreType]: {
            inboundUuids,
            profileUuid: inboundUuids.size > 0 ? input.profileUuid : null
        }
    }
}

export const selectCoreProfileInbounds = (
    state: ConcurrentProfileSelectionState,
    input: {
        coreType: ConfigProfileCoreType
        inboundUuids: string[]
        profileUuid: string
    }
): ConcurrentProfileSelectionState => ({
    ...state,
    [input.coreType]: {
        inboundUuids: new Set(input.inboundUuids),
        profileUuid: input.inboundUuids.length > 0 ? input.profileUuid : null
    }
})

export const clearCoreProfileSelection = (
    state: ConcurrentProfileSelectionState,
    coreType: ConfigProfileCoreType,
    profileUuid?: string
): ConcurrentProfileSelectionState => {
    if (profileUuid && state[coreType].profileUuid !== profileUuid) return state

    return {
        ...state,
        [coreType]: emptySelection()
    }
}

const toBinding = (selection: CoreProfileSelection): NodeProfileBinding | null =>
    selection.profileUuid && selection.inboundUuids.size > 0
        ? {
              activeConfigProfileUuid: selection.profileUuid,
              activeInbounds: Array.from(selection.inboundUuids)
          }
        : null

export const toConcurrentProfileBindings = (
    state: ConcurrentProfileSelectionState
): ConcurrentProfileBindings => ({
    configProfile: toBinding(state.xray),
    singBoxConfigProfile: toBinding(state.singbox)
})
