import type { JsonObject, VisualCoreType, VisualPatchOperation } from './types.ts'

export type OutboundEditorDraft = {
    tag: string
    protocol: string
    server: string
    port: string
    credential: string
    password: string
    method: string
    transport: string
    security: 'none' | 'reality' | 'tls'
    sni: string
    fingerprint: string
    flow: string
    sendThrough: string
    targetStrategy: string
}

const isObject = (value: unknown): value is JsonObject =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const object = (value: unknown): JsonObject => (isObject(value) ? value : {})
const first = (value: unknown): JsonObject =>
    Array.isArray(value) && isObject(value[0]) ? value[0] : {}
const text = (value: unknown): string =>
    typeof value === 'string' || typeof value === 'number' ? String(value) : ''
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const same = (left: unknown, right: unknown): boolean =>
    JSON.stringify(left) === JSON.stringify(right)
const numberPort = (value: string): number | undefined => {
    const result = Number(value)
    return Number.isInteger(result) && result >= 1 && result <= 65_535 ? result : undefined
}

export const getOutboundEditorDraft = (
    outbound: JsonObject,
    coreType: VisualCoreType
): OutboundEditorDraft => {
    if (coreType === 'singbox') {
        const tls = object(outbound.tls)
        const reality = object(tls.reality)
        const utls = object(tls.utls)
        return {
            tag: text(outbound.tag),
            protocol: text(outbound.type),
            server: text(outbound.server),
            port: text(outbound.server_port),
            credential: text(outbound.uuid ?? outbound.username),
            password: text(outbound.password),
            method: text(outbound.method),
            transport: text(object(outbound.transport).type),
            security: reality.enabled ? 'reality' : tls.enabled ? 'tls' : 'none',
            sni: text(tls.server_name),
            fingerprint: text(utls.fingerprint),
            flow: text(outbound.flow),
            sendThrough: text(outbound.bind_interface ?? outbound.inet4_bind_address),
            targetStrategy: text(outbound.domain_strategy)
        }
    }
    const settings = object(outbound.settings)
    const endpoint = first(settings.vnext ?? settings.servers)
    const user = first(endpoint.users)
    const stream = object(outbound.streamSettings)
    const tls = object(stream.tlsSettings)
    const reality = object(stream.realitySettings)
    return {
        tag: text(outbound.tag),
        protocol: text(outbound.protocol),
        server: text(endpoint.address),
        port: text(endpoint.port),
        credential: text(user.id ?? user.user),
        password: text(endpoint.password ?? user.pass),
        method: text(endpoint.method),
        transport: text(stream.network),
        security:
            stream.security === 'reality' ? 'reality' : stream.security === 'tls' ? 'tls' : 'none',
        sni: text(reality.serverName ?? tls.serverName),
        fingerprint: text(reality.fingerprint ?? tls.fingerprint),
        flow: text(user.flow),
        sendThrough: text(outbound.sendThrough),
        targetStrategy: text(settings.domainStrategy)
    }
}

export const buildOutboundEditorOperations = (
    outbound: JsonObject,
    index: number,
    coreType: VisualCoreType,
    draft: OutboundEditorDraft
): VisualPatchOperation[] => {
    const originalDraft = getOutboundEditorDraft(outbound, coreType)
    const next = clone(outbound)
    next.tag = draft.tag.trim()
    if (coreType === 'singbox') {
        if ('server' in next) next.server = draft.server.trim()
        if ('server_port' in next) next.server_port = numberPort(draft.port)
        if ('uuid' in next) next.uuid = draft.credential.trim()
        if ('username' in next) next.username = draft.credential.trim()
        if ('password' in next) next.password = draft.password
        if ('method' in next) next.method = draft.method
        if ('flow' in next) next.flow = draft.flow
        if ('domain_strategy' in next || draft.targetStrategy)
            next.domain_strategy = draft.targetStrategy
        const tls = object(next.tls)
        if (draft.security !== 'none' || isObject(next.tls)) {
            next.tls = {
                ...tls,
                enabled: draft.security !== 'none',
                server_name: draft.sni,
                ...(draft.fingerprint
                    ? {
                          utls: {
                              ...object(tls.utls),
                              enabled: true,
                              fingerprint: draft.fingerprint
                          }
                      }
                    : {}),
                ...(draft.security === 'reality'
                    ? { reality: { ...object(tls.reality), enabled: true } }
                    : {})
            }
        }
        if (
            ['server', 'port', 'credential', 'password', 'method', 'flow', 'targetStrategy'].every(
                (key) =>
                    originalDraft[key as keyof OutboundEditorDraft] ===
                    draft[key as keyof OutboundEditorDraft]
            )
        ) {
            for (const key of [
                'server',
                'server_port',
                'uuid',
                'username',
                'password',
                'method',
                'flow',
                'domain_strategy'
            ]) {
                if (key in outbound) next[key] = clone(outbound[key])
                else delete next[key]
            }
        }
        if (
            ['transport', 'security', 'sni', 'fingerprint'].every(
                (key) =>
                    originalDraft[key as keyof OutboundEditorDraft] ===
                    draft[key as keyof OutboundEditorDraft]
            )
        ) {
            for (const key of ['transport', 'tls']) {
                if (key in outbound) next[key] = clone(outbound[key])
                else delete next[key]
            }
        }
    } else {
        next.sendThrough = draft.sendThrough
        const settings = object(next.settings)
        const endpointKey = Array.isArray(settings.vnext) ? 'vnext' : 'servers'
        const endpoints = Array.isArray(settings[endpointKey])
            ? clone(settings[endpointKey] as unknown[])
            : []
        const endpoint = object(endpoints[0])
        endpoint.address = draft.server.trim()
        endpoint.port = numberPort(draft.port)
        if (draft.protocol === 'vless' || draft.protocol === 'vmess') {
            const users = Array.isArray(endpoint.users) ? clone(endpoint.users) : []
            const user = object(users[0])
            user.id = draft.credential.trim()
            if (draft.flow || 'flow' in user) user.flow = draft.flow
            users[0] = user
            endpoint.users = users
        } else {
            if ('password' in endpoint || draft.password) endpoint.password = draft.password
            if ('method' in endpoint || draft.method) endpoint.method = draft.method
        }
        endpoints[0] = endpoint
        next.settings = {
            ...settings,
            [endpointKey]: endpoints,
            domainStrategy: draft.targetStrategy
        }
        const stream = object(next.streamSettings)
        const nextStream: JsonObject = {
            ...stream,
            network: draft.transport || stream.network,
            security: draft.security
        }
        if (draft.security === 'tls') {
            nextStream.tlsSettings = {
                ...object(nextStream.tlsSettings),
                serverName: draft.sni,
                fingerprint: draft.fingerprint
            }
        } else if (draft.security === 'reality') {
            nextStream.realitySettings = {
                ...object(nextStream.realitySettings),
                serverName: draft.sni,
                fingerprint: draft.fingerprint
            }
        }
        next.streamSettings = nextStream
        if (originalDraft.sendThrough === draft.sendThrough) {
            if ('sendThrough' in outbound) next.sendThrough = outbound.sendThrough
            else delete next.sendThrough
        }
        if (
            ['server', 'port', 'credential', 'password', 'method', 'flow', 'targetStrategy'].every(
                (key) =>
                    originalDraft[key as keyof OutboundEditorDraft] ===
                    draft[key as keyof OutboundEditorDraft]
            )
        ) {
            if ('settings' in outbound) next.settings = clone(outbound.settings)
            else delete next.settings
        }
        if (
            ['transport', 'security', 'sni', 'fingerprint'].every(
                (key) =>
                    originalDraft[key as keyof OutboundEditorDraft] ===
                    draft[key as keyof OutboundEditorDraft]
            )
        ) {
            if ('streamSettings' in outbound) next.streamSettings = clone(outbound.streamSettings)
            else delete next.streamSettings
        }
    }
    return [...new Set([...Object.keys(outbound), ...Object.keys(next)])].flatMap(
        (key): VisualPatchOperation[] =>
            same(outbound[key], next[key])
                ? []
                : next[key] === undefined
                  ? [{ op: 'remove', path: ['outbounds', index, key] }]
                  : [{ op: 'set', path: ['outbounds', index, key], value: next[key] }]
    )
}
