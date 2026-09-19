import type { VisualCoreType } from './types.ts'

export type VisualInboundProtocol =
    | 'anytls'
    | 'http'
    | 'hysteria'
    | 'hysteria2'
    | 'mixed'
    | 'shadowsocks'
    | 'socks'
    | 'trojan'
    | 'vless'
    | 'vmess'

const SUPPORTED_INBOUND_PROTOCOLS: Record<VisualCoreType, readonly VisualInboundProtocol[]> = {
    xray: ['vless', 'vmess', 'trojan', 'shadowsocks', 'socks', 'http', 'mixed', 'hysteria'],
    singbox: [
        'vless',
        'vmess',
        'trojan',
        'shadowsocks',
        'socks',
        'http',
        'mixed',
        'hysteria2',
        'anytls'
    ]
}

export const getSupportedInboundProtocols = (
    coreType: VisualCoreType
): readonly VisualInboundProtocol[] => SUPPORTED_INBOUND_PROTOCOLS[coreType]

export const supportsInboundProtocol = (coreType: VisualCoreType, protocol: string): boolean =>
    getSupportedInboundProtocols(coreType).includes(protocol.toLowerCase() as VisualInboundProtocol)
