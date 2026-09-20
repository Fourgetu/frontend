export interface UserRouteEditValues {
    speedLimitUuid: string | null
    portHoppingConfigUuid: string | null
}

interface UserRouteEditSource extends UserRouteEditValues {
    uuid: string
}

interface UserRouteHoppingSource {
    portHoppingConfigUuid: string | null
    configProfileInboundUuid: string
    network: 'tcp' | 'udp' | 'tcp,udp'
}

interface UserRouteHoppingConfig {
    uuid: string
    configProfileInboundUuid: string
    enabled: boolean
}

export interface UserRouteEditPatch extends Partial<UserRouteEditValues> {
    uuid: string
}

export const createUserRouteEditValues = (route: UserRouteEditValues): UserRouteEditValues => ({
    speedLimitUuid: route.speedLimitUuid,
    portHoppingConfigUuid: route.portHoppingConfigUuid
})

export const buildUserRouteEditPatch = (
    route: UserRouteEditSource,
    values: UserRouteEditValues
): UserRouteEditPatch => {
    const patch: UserRouteEditPatch = { uuid: route.uuid }

    if (values.speedLimitUuid !== route.speedLimitUuid) {
        patch.speedLimitUuid = values.speedLimitUuid
    }
    // Sending even an unchanged hopping binding asks the backend to allocate a new range.
    if (values.portHoppingConfigUuid !== route.portHoppingConfigUuid) {
        patch.portHoppingConfigUuid = values.portHoppingConfigUuid
    }

    return patch
}

export const hasUserRouteEditChanges = (
    route: UserRouteEditValues,
    values: UserRouteEditValues
): boolean =>
    values.speedLimitUuid !== route.speedLimitUuid ||
    values.portHoppingConfigUuid !== route.portHoppingConfigUuid

export const isUserRouteEditHoppingValid = (
    route: UserRouteHoppingSource,
    values: UserRouteEditValues,
    configs: readonly UserRouteHoppingConfig[]
): boolean => {
    if (
        values.portHoppingConfigUuid === route.portHoppingConfigUuid ||
        values.portHoppingConfigUuid === null
    ) {
        return true
    }

    return (
        route.network === 'udp' &&
        configs.some(
            (config) =>
                config.uuid === values.portHoppingConfigUuid &&
                config.enabled &&
                config.configProfileInboundUuid === route.configProfileInboundUuid
        )
    )
}
