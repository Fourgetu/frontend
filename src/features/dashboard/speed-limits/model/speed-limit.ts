export const mbpsToBytesPerSecond = (value: number): number => {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error('Mbps must be a finite, non-negative number')
    }
    return Math.round((value * 1_000_000) / 8)
}

export const bytesPerSecondToMbps = (value: number): number => {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error('Bytes per second must be a finite, non-negative number')
    }
    return (value * 8) / 1_000_000
}

export const isLoopbackAddress = (value: unknown): value is '127.0.0.1' | '::1' =>
    value === '127.0.0.1' || value === '::1'

export const getGostForwardNetwork = (inboundType: string): 'tcp' | 'udp' =>
    inboundType.toLowerCase().includes('hysteria') ? 'udp' : 'tcp'

interface HostRouteCandidate {
    inbound: {
        configProfileInboundUuid: string | null
        configProfileUuid: string | null
    }
    nodes: string[]
}

interface SelectedRouteInbound {
    profileUuid: string
    uuid: string
}

interface UserRouteInbound extends SelectedRouteInbound {
    port: number | null
}

interface UserRouteHost extends HostRouteCandidate {
    uuid: string
}

interface UserRouteFormState {
    userId: string | null
    nodeUuid: string | null
    inboundUuid: string | null
    hostUuid: string | null
    selectedInbound: UserRouteInbound | undefined
    selectedHost: UserRouteHost | undefined
    internalAddress: unknown
    externalPort: number | string
    portHoppingConfigUuid: string | null
    safetyConfirmed: boolean
}

export const isHostCompatibleWithUserRoute = (
    host: HostRouteCandidate,
    nodeUuid: string,
    inbound: SelectedRouteInbound
): boolean =>
    host.inbound.configProfileUuid === inbound.profileUuid &&
    host.inbound.configProfileInboundUuid === inbound.uuid &&
    (host.nodes.length === 0 || host.nodes.includes(nodeUuid))

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined

export const resolveInboundListenAddress = (
    rawInbound: unknown,
    profileConfig: unknown,
    inboundTag: string
): unknown => {
    const rawListen = asRecord(rawInbound)?.listen
    if (rawListen !== undefined) return rawListen

    const inbounds = asRecord(profileConfig)?.inbounds
    if (!Array.isArray(inbounds)) return undefined

    return inbounds.map(asRecord).find((inbound) => inbound?.tag === inboundTag)?.listen
}

export const isExternalPortValid = (externalPort: number | string): boolean =>
    externalPort === '' ||
    (typeof externalPort === 'number' &&
        Number.isInteger(externalPort) &&
        externalPort >= 1 &&
        externalPort <= 65_535)

export const isUserRouteFormReady = ({
    userId,
    nodeUuid,
    inboundUuid,
    hostUuid,
    selectedInbound,
    selectedHost,
    internalAddress,
    externalPort,
    safetyConfirmed
}: UserRouteFormState): boolean =>
    Boolean(
        userId &&
        nodeUuid &&
        inboundUuid &&
        hostUuid &&
        selectedInbound?.uuid === inboundUuid &&
        selectedInbound.port !== null &&
        selectedHost?.uuid === hostUuid &&
        isHostCompatibleWithUserRoute(selectedHost, nodeUuid, selectedInbound) &&
        isLoopbackAddress(internalAddress) &&
        isExternalPortValid(externalPort) &&
        safetyConfirmed
    )
