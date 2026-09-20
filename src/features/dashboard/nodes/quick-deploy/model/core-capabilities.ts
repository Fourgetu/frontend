import { getProtocolPipeline } from '../../../config-profiles/protocol-presets/model/dual-core-capabilities.ts'

export type ProxyCoreType = 'xray' | 'singbox'

export type QuickDeployCapabilityStatus = 'experimental' | 'supported' | 'unsupported'
export type QuickDeployAvailability = 'disabled' | 'enabled' | 'hidden'

export type QuickDeployProtocolId =
    | 'shadowsocks-2022'
    | 'singbox-shadowsocks-2022'
    | 'singbox-vless-reality-vision'
    | 'vless-reality-vision'
    | 'vless-reality-grpc'
    | 'trojan-tcp-tls'
    | 'vmess-ws-tls'
    | 'hysteria2'
    | 'xray-socks5'
    | 'xray-xhttp'
    | 'singbox-hysteria2'
    | 'singbox-anytls'
    | 'singbox-socks5'
    | 'singbox-hysteria2-port-hopping'
    | 'xray-mixed'
    | 'singbox-mixed'

export interface CoreCapability {
    availability: QuickDeployAvailability
    coreType: ProxyCoreType
    id: QuickDeployProtocolId
    needsCertificate: boolean
    needsDomain: boolean
    recommended: boolean
    security: string
    status: QuickDeployCapabilityStatus
    title: string
    transport: string
    udpStatus?: QuickDeployCapabilityStatus
    createsHostByDefault?: boolean
}

/**
 * The production gate for every Quick Deploy protocol lives here. Builders and
 * UI components consume this table; they must not independently decide whether
 * an unverified protocol is available.
 */
const CORE_ENTRIES: readonly CoreCapability[] = [
    {
        id: 'shadowsocks-2022',
        coreType: 'xray',
        title: 'Shadowsocks 2022',
        transport: 'TCP + UDP',
        security: 'AEAD 2022',
        needsDomain: false,
        needsCertificate: false,
        recommended: false,
        status: 'supported',
        availability: 'enabled'
    },
    {
        id: 'singbox-shadowsocks-2022',
        coreType: 'singbox',
        title: 'Shadowsocks 2022',
        transport: 'TCP + UDP',
        security: 'AEAD 2022',
        needsDomain: false,
        needsCertificate: false,
        recommended: false,
        status: 'supported',
        availability: 'enabled'
    },
    {
        id: 'singbox-vless-reality-vision',
        coreType: 'singbox',
        title: 'VLESS Reality Vision',
        transport: 'TCP',
        security: 'Reality',
        needsDomain: false,
        needsCertificate: false,
        recommended: true,
        status: 'supported',
        availability: 'enabled'
    },
    {
        id: 'vless-reality-vision',
        coreType: 'xray',
        title: 'VLESS Reality Vision',
        transport: 'TCP (raw)',
        security: 'Reality',
        needsDomain: false,
        needsCertificate: false,
        recommended: true,
        status: 'supported',
        availability: 'enabled'
    },
    {
        id: 'vless-reality-grpc',
        coreType: 'xray',
        title: 'VLESS Reality gRPC',
        transport: 'gRPC',
        security: 'Reality',
        needsDomain: false,
        needsCertificate: false,
        recommended: true,
        status: 'supported',
        availability: 'enabled'
    },
    {
        id: 'trojan-tcp-tls',
        coreType: 'xray',
        title: 'Trojan TCP TLS',
        transport: 'TCP (raw)',
        security: 'TLS',
        needsDomain: true,
        needsCertificate: true,
        recommended: true,
        status: 'supported',
        availability: 'enabled'
    },
    {
        id: 'hysteria2',
        coreType: 'xray',
        title: 'Hysteria2',
        transport: 'QUIC / HTTP3',
        security: 'TLS',
        needsDomain: true,
        needsCertificate: true,
        recommended: false,
        status: 'unsupported',
        availability: 'hidden'
    },
    {
        id: 'vmess-ws-tls',
        coreType: 'xray',
        title: 'VMess WebSocket TLS',
        transport: 'WebSocket',
        security: 'TLS',
        needsDomain: true,
        needsCertificate: true,
        recommended: false,
        status: 'unsupported',
        availability: 'hidden'
    },
    {
        id: 'xray-xhttp',
        coreType: 'xray',
        title: 'VLESS XHTTP',
        transport: 'XHTTP',
        security: 'TLS / Reality',
        needsDomain: true,
        needsCertificate: false,
        recommended: false,
        status: 'experimental',
        availability: 'hidden'
    },
    {
        id: 'xray-socks5',
        coreType: 'xray',
        title: 'SOCKS5',
        transport: 'TCP + UDP',
        security: 'Username / password',
        needsDomain: false,
        needsCertificate: false,
        recommended: false,
        status: 'experimental',
        udpStatus: 'experimental',
        availability: 'disabled'
    },
    {
        id: 'xray-mixed',
        coreType: 'xray',
        title: 'Mixed',
        transport: 'SOCKS + HTTP',
        security: 'None',
        needsDomain: false,
        needsCertificate: false,
        recommended: false,
        status: 'supported',
        availability: 'enabled',
        createsHostByDefault: false
    },
    {
        id: 'singbox-hysteria2',
        coreType: 'singbox',
        title: 'Hysteria2',
        transport: 'QUIC / HTTP3',
        security: 'TLS',
        needsDomain: true,
        needsCertificate: true,
        recommended: true,
        status: 'supported',
        availability: 'enabled'
    },
    {
        id: 'singbox-anytls',
        coreType: 'singbox',
        title: 'AnyTLS',
        transport: 'TCP',
        security: 'TLS',
        needsDomain: true,
        needsCertificate: true,
        recommended: false,
        status: 'experimental',
        availability: 'disabled'
    },
    {
        id: 'singbox-socks5',
        coreType: 'singbox',
        title: 'SOCKS5',
        transport: 'TCP + UDP',
        security: 'Username / password',
        needsDomain: false,
        needsCertificate: false,
        recommended: false,
        status: 'experimental',
        udpStatus: 'experimental',
        availability: 'disabled'
    },
    {
        id: 'singbox-mixed',
        coreType: 'singbox',
        title: 'Mixed',
        transport: 'SOCKS + HTTP',
        security: 'None',
        needsDomain: false,
        needsCertificate: false,
        recommended: false,
        status: 'supported',
        availability: 'enabled',
        createsHostByDefault: false
    },
    {
        id: 'singbox-hysteria2-port-hopping',
        coreType: 'singbox',
        title: 'Hysteria2 Port Hopping',
        transport: 'QUIC / HTTP3',
        security: 'TLS',
        needsDomain: true,
        needsCertificate: true,
        recommended: false,
        status: 'experimental',
        availability: 'hidden'
    }
] as const

export const CORE_CAPABILITIES: readonly CoreCapability[] = CORE_ENTRIES.map((capability) => {
    const pipeline = getProtocolPipeline(capability.coreType, capability.id)
    return pipeline && !pipeline.quickDeploy
        ? { ...capability, availability: 'hidden', status: 'unsupported', recommended: false }
        : capability
})

export const getCoreCapabilities = (
    coreType: ProxyCoreType,
    options: { includeHidden?: boolean } = {}
): CoreCapability[] =>
    CORE_CAPABILITIES.filter(
        (capability) =>
            capability.coreType === coreType &&
            (options.includeHidden || capability.availability !== 'hidden')
    )

export const getQuickDeployCapability = (id: QuickDeployProtocolId): CoreCapability => {
    const capability = CORE_CAPABILITIES.find((item) => item.id === id)
    if (!capability) throw new Error(`Unknown Quick Deploy capability: ${id}`)
    return capability
}

export const getRecommendedQuickDeployProtocolIds = (
    coreType: ProxyCoreType
): QuickDeployProtocolId[] =>
    getCoreCapabilities(coreType)
        .filter((capability) => capability.recommended && capability.availability === 'enabled')
        .map((capability) => capability.id)

export const assertQuickDeployCapabilityEnabled = (
    coreType: ProxyCoreType,
    id: QuickDeployProtocolId
): CoreCapability => {
    const capability = getQuickDeployCapability(id)
    if (capability.coreType !== coreType) {
        throw new Error(`${capability.title} belongs to ${capability.coreType}, not ${coreType}.`)
    }
    if (capability.availability !== 'enabled') {
        throw new Error(
            `${capability.title} is not supported for production Quick Deploy (${capability.status}).`
        )
    }
    return capability
}
