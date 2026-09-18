export type VisualCoreType = 'xray' | 'singbox'

export type JsonObject = Record<string, unknown>
export type JsonPath = Array<string | number>

export type VisualSummary = {
    count: number
    items: Array<{ id: string; label: string; detail?: string; readOnly?: boolean }>
}

export type VisualRealityDetails = {
    target?: string
    serverNames: string[]
    shortIds: string[]
    minClientVer?: string
    privateKeyPresent: boolean
}

export type VisualInbound = {
    index: number
    id: string
    tag: string
    protocol: string
    listen: string
    port: number | string | undefined
    transport?: string
    security?: string
    reality?: VisualRealityDetails
    raw: JsonObject
    readOnly: boolean
    readOnlyReason?: string
}

export type VisualOutbound = {
    index: number
    id: string
    tag: string
    protocol: string
    server?: string
    port?: number | string
    transport?: string
    security?: string
    sensitiveFields: string[]
    raw: JsonObject
    readOnly: boolean
    readOnlyReason?: string
}

export type VisualOutboundReference = {
    tag: string
    path: string
    label: string
    kind: 'routing' | 'balancer' | 'observatory' | 'advanced'
}

export type VisualRoutingRule = {
    index: number
    id: string
    ruleTag?: string
    domains: string[]
    ips: string[]
    ports?: string
    sourcePorts?: string
    networks: string[]
    sources: string[]
    users: string[]
    inboundTags: string[]
    protocols: string[]
    attrs?: string
    outboundTag?: string
    balancerTag?: string
    targetKind: 'outbound' | 'balancer' | 'none'
    summary: string
    raw: JsonObject
    readOnly: boolean
    readOnlyReason?: string
}

export type VisualDnsServer = {
    index: number
    id: string
    kind: 'string' | 'object'
    address: string
    tag?: string
    domains: string[]
    expectIPs: string[]
    skipFallback?: boolean
    queryStrategy?: string
    readOnly: boolean
    readOnlyReason?: string
    raw: unknown
}

export type VisualDnsHost = {
    key: string
    values: string[]
    valueKind: 'string' | 'array'
    raw: unknown
}

export type VisualDnsDetails = {
    servers: VisualDnsServer[]
    hosts: VisualDnsHost[]
    clientIp?: string
    tag?: string
    queryStrategy?: string
    final?: string
    strategy?: string
    rulesCount: number
    advancedPaths: string[]
}

export type VisualReferences = {
    inboundTags: string[]
    inboundReferences: Array<{ tag: string; path: string; label: string }>
    outboundTags: string[]
    outboundReferences: VisualOutboundReference[]
    balancerTags: string[]
    snippetPaths: string[]
}

export type VisualDocument = {
    coreType: VisualCoreType
    rawSnapshot: JsonObject
    inbounds: VisualSummary
    inboundDetails: VisualInbound[]
    outboundDetails: VisualOutbound[]
    routingDetails: VisualRoutingRule[]
    outbounds: VisualSummary
    routing: VisualSummary
    dns: VisualSummary
    dnsDetails: VisualDnsDetails
    references: VisualReferences
    unsupportedPaths: string[]
    unknownFields: string[]
    visualEditingLimited: boolean
}

export type VisualPatchOperation =
    | { op: 'set'; path: JsonPath; value: unknown }
    | { op: 'remove'; path: JsonPath }

export type VisualPatch = {
    operations: VisualPatchOperation[]
}
