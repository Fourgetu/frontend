import type { JsonObject, VisualCoreType, VisualPatchOperation } from './types.ts'

export type InboundEditorDraft = {
    tag: string
    listen: string
    port: string
    protocol: string
    auth: 'noauth' | 'password'
    udp: boolean
    userLevel: string
    username: string
    password: string
    transport: string
    headerType: string
    path: string
    host: string
    serviceName: string
    multiMode: boolean
    xhttpMode: string
    security: 'none' | 'tls' | 'reality'
    realityShow: boolean
    realityXver: string
    realityTarget: string
    realityServerNames: string[]
    realityPrivateKey: string
    realityShortIds: string[]
    realitySpiderX: string
    realityFingerprint: string
    realityMaxTimeDiff: string
    minClientVer: string
    maxClientVer: string
    tlsServerName: string
    tlsAlpn: string[]
    certificateFile: string
    keyFile: string
    tlsMinVersion: string
    tlsMaxVersion: string
    tlsFingerprint: string
    sniffEnabled: boolean
    sniffDestOverride: string[]
    sniffMetadataOnly: boolean
    sniffRouteOnly: boolean
    sniffDomainsExcluded: string[]
    sniffIpsExcluded: string[]
}

const isObject = (value: unknown): value is JsonObject =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const object = (value: unknown): JsonObject => (isObject(value) ? value : {})
const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const text = (value: unknown): string =>
    typeof value === 'string' || typeof value === 'number' ? String(value) : ''
const bool = (value: unknown): boolean => value === true
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export const normalizeTagValues = (values: readonly string[]): string[] => {
    const seen = new Set<string>()
    return values
        .flatMap((item) => item.split(/[,\n]/))
        .map((item) => item.trim())
        .filter((item) => item.length > 0 && !seen.has(item) && Boolean(seen.add(item)))
}

export const getInboundEditorDraft = (
    inbound: JsonObject,
    coreType: VisualCoreType,
    realityDefault: string
): InboundEditorDraft => {
    if (coreType === 'singbox') {
        const tls = object(inbound.tls)
        const utls = object(tls.utls)
        const transport = object(inbound.transport)
        const users =
            Array.isArray(inbound.users) && isObject(inbound.users[0]) ? inbound.users[0] : {}
        return {
            tag: text(inbound.tag),
            listen: text(inbound.listen),
            port: text(inbound.listen_port),
            protocol: text(inbound.type),
            auth: Array.isArray(inbound.users) && inbound.users.length > 0 ? 'password' : 'noauth',
            udp: true,
            userLevel: '0',
            username: text(users.username),
            password: text(users.password),
            transport: text(transport.type),
            headerType: '',
            path: text(transport.path),
            host: text(transport.host),
            serviceName: text(transport.service_name),
            multiMode: false,
            xhttpMode: '',
            security: bool(tls.enabled) ? 'tls' : 'none',
            realityShow: false,
            realityXver: '',
            realityTarget: '',
            realityServerNames: [],
            realityPrivateKey: '',
            realityShortIds: [],
            realitySpiderX: '',
            realityFingerprint: '',
            realityMaxTimeDiff: '',
            minClientVer: realityDefault,
            maxClientVer: '',
            tlsServerName: text(tls.server_name),
            tlsAlpn: strings(tls.alpn),
            certificateFile: text(tls.certificate_path),
            keyFile: text(tls.key_path),
            tlsMinVersion: text(tls.min_version),
            tlsMaxVersion: text(tls.max_version),
            tlsFingerprint: text(utls.fingerprint),
            sniffEnabled: bool(inbound.sniff),
            sniffDestOverride: bool(inbound.sniff_override_destination) ? ['destination'] : [],
            sniffMetadataOnly: false,
            sniffRouteOnly: false,
            sniffDomainsExcluded: [],
            sniffIpsExcluded: []
        }
    }

    const settings = object(inbound.settings)
    const stream = object(inbound.streamSettings)
    const reality = object(stream.realitySettings)
    const tls = object(stream.tlsSettings)
    const certificate =
        Array.isArray(tls.certificates) && isObject(tls.certificates[0]) ? tls.certificates[0] : {}
    const sniffing = object(inbound.sniffing)
    const network = text(stream.network) || 'raw'
    const transport = object(
        network === 'ws'
            ? stream.wsSettings
            : network === 'grpc'
              ? stream.grpcSettings
              : network === 'httpupgrade'
                ? stream.httpupgradeSettings
                : network === 'xhttp'
                  ? stream.xhttpSettings
                  : network === 'kcp'
                    ? stream.kcpSettings
                    : (stream.rawSettings ?? stream.tcpSettings)
    )
    const header = object(transport.header)
    const headers = object(transport.headers)
    const account =
        Array.isArray(settings.accounts) && isObject(settings.accounts[0])
            ? settings.accounts[0]
            : {}
    return {
        tag: text(inbound.tag),
        listen: text(inbound.listen),
        port: text(inbound.port),
        protocol: text(inbound.protocol),
        auth: settings.auth === 'password' ? 'password' : 'noauth',
        udp: settings.udp !== false,
        userLevel: text(settings.userLevel || 0),
        username: text(account.user),
        password: text(account.pass),
        transport: network,
        headerType: text(header.type),
        path: text(transport.path),
        host: text(transport.host ?? headers.Host),
        serviceName: text(transport.serviceName),
        multiMode: bool(transport.multiMode),
        xhttpMode: text(transport.mode),
        security:
            stream.security === 'reality' ? 'reality' : stream.security === 'tls' ? 'tls' : 'none',
        realityShow: bool(reality.show),
        realityXver: text(reality.xver || 0),
        realityTarget: text(reality.target ?? reality.dest),
        realityServerNames: strings(reality.serverNames),
        realityPrivateKey: text(reality.privateKey),
        realityShortIds: strings(reality.shortIds),
        realitySpiderX: text(reality.spiderX),
        realityFingerprint: text(reality.fingerprint),
        realityMaxTimeDiff: text(reality.maxTimeDiff),
        minClientVer: text(reality.minClientVer) || realityDefault,
        maxClientVer: text(reality.maxClientVer),
        tlsServerName: text(tls.serverName),
        tlsAlpn: strings(tls.alpn),
        certificateFile: text(certificate.certificateFile),
        keyFile: text(certificate.keyFile),
        tlsMinVersion: text(tls.minVersion),
        tlsMaxVersion: text(tls.maxVersion),
        tlsFingerprint: text(tls.fingerprint),
        sniffEnabled: bool(sniffing.enabled),
        sniffDestOverride: strings(sniffing.destOverride),
        sniffMetadataOnly: bool(sniffing.metadataOnly),
        sniffRouteOnly: bool(sniffing.routeOnly),
        sniffDomainsExcluded: strings(sniffing.domainsExcluded),
        sniffIpsExcluded: strings(sniffing.ipsExcluded)
    }
}

const same = (left: unknown, right: unknown): boolean =>
    JSON.stringify(left) === JSON.stringify(right)
const port = (value: string): number | undefined => {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65_535 ? parsed : undefined
}

export const buildInboundEditorOperations = (
    inbound: JsonObject,
    index: number,
    coreType: VisualCoreType,
    draft: InboundEditorDraft
): VisualPatchOperation[] => {
    const originalDraft = getInboundEditorDraft(inbound, coreType, '1.8.1')
    const next = clone(inbound)
    next.tag = draft.tag.trim()
    next.listen = draft.listen.trim()
    if (coreType === 'singbox') {
        next.listen_port = port(draft.port)
        if (draft.protocol === 'mixed') {
            next.users =
                draft.auth === 'password'
                    ? [{ username: draft.username, password: draft.password }]
                    : []
        }
        if (draft.security === 'tls') {
            const originalTls = object(next.tls)
            next.tls = {
                ...originalTls,
                enabled: true,
                server_name: draft.tlsServerName,
                alpn: normalizeTagValues(draft.tlsAlpn),
                certificate_path: draft.certificateFile,
                key_path: draft.keyFile,
                min_version: draft.tlsMinVersion,
                max_version: draft.tlsMaxVersion,
                ...(draft.tlsFingerprint
                    ? {
                          utls: {
                              ...object(originalTls.utls),
                              enabled: true,
                              fingerprint: draft.tlsFingerprint
                          }
                      }
                    : {})
            }
        } else if (isObject(next.tls)) next.tls = { ...next.tls, enabled: false }
        next.sniff = draft.sniffEnabled
        next.sniff_override_destination = draft.sniffDestOverride.includes('destination')
        if (
            originalDraft.auth === draft.auth &&
            originalDraft.username === draft.username &&
            originalDraft.password === draft.password
        ) {
            if ('users' in inbound) next.users = clone(inbound.users)
            else delete next.users
        }
        if (
            [
                'security',
                'tlsServerName',
                'tlsAlpn',
                'certificateFile',
                'keyFile',
                'tlsMinVersion',
                'tlsMaxVersion',
                'tlsFingerprint'
            ].every(
                (key) =>
                    JSON.stringify(originalDraft[key as keyof InboundEditorDraft]) ===
                    JSON.stringify(draft[key as keyof InboundEditorDraft])
            )
        ) {
            if ('tls' in inbound) next.tls = clone(inbound.tls)
            else delete next.tls
        }
        if (originalDraft.sniffEnabled === draft.sniffEnabled) {
            if ('sniff' in inbound) next.sniff = inbound.sniff
            else delete next.sniff
        }
        if (same(originalDraft.sniffDestOverride, draft.sniffDestOverride)) {
            if ('sniff_override_destination' in inbound) {
                next.sniff_override_destination = inbound.sniff_override_destination
            } else delete next.sniff_override_destination
        }
    } else {
        next.port = port(draft.port)
        if (draft.protocol === 'mixed') {
            const settings = object(next.settings)
            next.settings = {
                ...settings,
                auth: draft.auth,
                udp: draft.udp,
                userLevel: Number(draft.userLevel) || 0,
                accounts:
                    draft.auth === 'password'
                        ? [{ user: draft.username, pass: draft.password }]
                        : []
            }
        }
        const stream = object(next.streamSettings)
        const network = draft.transport || text(stream.network) || 'raw'
        const nextStream: JsonObject = { ...stream, network, security: draft.security }
        const key =
            network === 'ws'
                ? 'wsSettings'
                : network === 'grpc'
                  ? 'grpcSettings'
                  : network === 'httpupgrade'
                    ? 'httpupgradeSettings'
                    : network === 'xhttp'
                      ? 'xhttpSettings'
                      : network === 'kcp'
                        ? 'kcpSettings'
                        : network === 'tcp' && stream.tcpSettings
                          ? 'tcpSettings'
                          : 'rawSettings'
        const originalTransport = object(nextStream[key])
        if (network === 'ws') {
            nextStream[key] = {
                ...originalTransport,
                path: draft.path,
                headers: { ...object(originalTransport.headers), Host: draft.host }
            }
        } else if (network === 'grpc') {
            nextStream[key] = {
                ...originalTransport,
                serviceName: draft.serviceName,
                multiMode: draft.multiMode
            }
        } else if (network === 'httpupgrade') {
            nextStream[key] = { ...originalTransport, path: draft.path, host: draft.host }
        } else if (network === 'xhttp') {
            nextStream[key] = {
                ...originalTransport,
                path: draft.path,
                host: draft.host,
                mode: draft.xhttpMode
            }
        } else {
            nextStream[key] = {
                ...originalTransport,
                header: { ...object(originalTransport.header), type: draft.headerType || 'none' }
            }
        }
        if (draft.security === 'reality') {
            nextStream.realitySettings = {
                ...object(nextStream.realitySettings),
                show: draft.realityShow,
                xver: Number(draft.realityXver) || 0,
                target: draft.realityTarget,
                serverNames: normalizeTagValues(draft.realityServerNames),
                privateKey: draft.realityPrivateKey,
                shortIds: normalizeTagValues(draft.realityShortIds),
                spiderX: draft.realitySpiderX,
                fingerprint: draft.realityFingerprint,
                maxTimeDiff: Number(draft.realityMaxTimeDiff) || 0,
                minClientVer: draft.minClientVer || '1.8.1',
                maxClientVer: draft.maxClientVer
            }
        } else if (draft.security === 'tls') {
            const originalTls = object(nextStream.tlsSettings)
            const certificates = Array.isArray(originalTls.certificates)
                ? [...originalTls.certificates]
                : []
            certificates[0] = {
                ...object(certificates[0]),
                certificateFile: draft.certificateFile,
                keyFile: draft.keyFile
            }
            nextStream.tlsSettings = {
                ...originalTls,
                serverName: draft.tlsServerName,
                alpn: normalizeTagValues(draft.tlsAlpn),
                minVersion: draft.tlsMinVersion,
                maxVersion: draft.tlsMaxVersion,
                fingerprint: draft.tlsFingerprint,
                certificates
            }
        }
        next.streamSettings = nextStream
        next.sniffing = {
            ...object(next.sniffing),
            enabled: draft.sniffEnabled,
            destOverride: normalizeTagValues(draft.sniffDestOverride),
            metadataOnly: draft.sniffMetadataOnly,
            routeOnly: draft.sniffRouteOnly,
            domainsExcluded: normalizeTagValues(draft.sniffDomainsExcluded),
            ipsExcluded: normalizeTagValues(draft.sniffIpsExcluded)
        }
        if (
            ['auth', 'udp', 'userLevel', 'username', 'password'].every(
                (key) =>
                    JSON.stringify(originalDraft[key as keyof InboundEditorDraft]) ===
                    JSON.stringify(draft[key as keyof InboundEditorDraft])
            )
        ) {
            if ('settings' in inbound) next.settings = clone(inbound.settings)
            else delete next.settings
        }
        const patchedStream = object(next.streamSettings)
        const originalStream = object(inbound.streamSettings)
        if (
            [
                'transport',
                'headerType',
                'path',
                'host',
                'serviceName',
                'multiMode',
                'xhttpMode'
            ].every(
                (key) =>
                    JSON.stringify(originalDraft[key as keyof InboundEditorDraft]) ===
                    JSON.stringify(draft[key as keyof InboundEditorDraft])
            )
        ) {
            for (const key of [
                'network',
                'rawSettings',
                'tcpSettings',
                'wsSettings',
                'grpcSettings',
                'httpupgradeSettings',
                'xhttpSettings',
                'kcpSettings'
            ]) {
                if (key in originalStream) patchedStream[key] = clone(originalStream[key])
                else delete patchedStream[key]
            }
        }
        if (
            [
                'security',
                'realityShow',
                'realityXver',
                'realityTarget',
                'realityServerNames',
                'realityPrivateKey',
                'realityShortIds',
                'realitySpiderX',
                'realityFingerprint',
                'realityMaxTimeDiff',
                'minClientVer',
                'maxClientVer',
                'tlsServerName',
                'tlsAlpn',
                'certificateFile',
                'keyFile',
                'tlsMinVersion',
                'tlsMaxVersion',
                'tlsFingerprint'
            ].every(
                (key) =>
                    JSON.stringify(originalDraft[key as keyof InboundEditorDraft]) ===
                    JSON.stringify(draft[key as keyof InboundEditorDraft])
            )
        ) {
            for (const key of ['security', 'realitySettings', 'tlsSettings']) {
                if (key in originalStream) patchedStream[key] = clone(originalStream[key])
                else delete patchedStream[key]
            }
        }
        next.streamSettings = patchedStream
        if (
            [
                'sniffEnabled',
                'sniffDestOverride',
                'sniffMetadataOnly',
                'sniffRouteOnly',
                'sniffDomainsExcluded',
                'sniffIpsExcluded'
            ].every(
                (key) =>
                    JSON.stringify(originalDraft[key as keyof InboundEditorDraft]) ===
                    JSON.stringify(draft[key as keyof InboundEditorDraft])
            )
        ) {
            if ('sniffing' in inbound) next.sniffing = clone(inbound.sniffing)
            else delete next.sniffing
        }
    }

    const keys = new Set([...Object.keys(inbound), ...Object.keys(next)])
    return [...keys].flatMap((key): VisualPatchOperation[] => {
        if (same(inbound[key], next[key])) return []
        if (next[key] === undefined) return [{ op: 'remove', path: ['inbounds', index, key] }]
        return [{ op: 'set', path: ['inbounds', index, key], value: next[key] }]
    })
}
