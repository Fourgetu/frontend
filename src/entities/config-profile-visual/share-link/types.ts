import type { RelayNetwork } from '../../../features/dashboard/nodes/relay/model/relay.ts'

export type ShareLinkProtocol = 'hysteria2' | 'shadowsocks' | 'trojan' | 'tuic' | 'vless' | 'vmess'

export type NormalizedOutboundLink = {
    address: string
    alterId?: number
    alpn?: string[]
    allowInsecure?: boolean
    encryption?: string
    fingerprint?: string
    flow?: string
    headerType?: 'http' | 'none'
    host?: string
    method?: string
    network: RelayNetwork | 'udp'
    obfs?: string
    obfsPassword?: string
    password?: string
    path?: string
    plugin?: string
    pluginOptions?: string
    port: number
    protocol: ShareLinkProtocol
    publicKey?: string
    remark?: string
    security: 'none' | 'reality' | 'tls'
    serviceName?: string
    shortId?: string
    spiderX?: string
    sni?: string
    uuid?: string
    vmessSecurity?: string
}
