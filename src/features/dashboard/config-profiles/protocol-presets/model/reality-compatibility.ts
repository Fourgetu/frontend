export const REALITY_CLIENT_COMPATIBILITY = {
    compatible: '1.8.1',
    mihomo: '1.8.2',
    unrestricted: '0.0.0',
    xray: '26.3.27'
} as const

export const REALITY_MIN_CLIENT_VERSION_COMPAT = REALITY_CLIENT_COMPATIBILITY.compatible

export type RealityCompatibility = {
    mihomo: boolean
    singbox: boolean
    xray: boolean
}

export const REALITY_VERSION_PATTERN = /^\d+\.\d+\.\d+$/

const parseVersion = (value: string): [number, number, number] | undefined => {
    if (!REALITY_VERSION_PATTERN.test(value)) return undefined
    const parts = value.split('.').map(Number)
    if (parts.some((part) => !Number.isSafeInteger(part) || part < 0)) return undefined
    return parts as [number, number, number]
}

const compareVersions = (left: string, right: string): number => {
    const a = parseVersion(left)
    const b = parseVersion(right)
    if (!a || !b) return Number.NaN
    for (let index = 0; index < 3; index += 1) {
        if (a[index] !== b[index]) return a[index] - b[index]
    }
    return 0
}

export const validateRealityMinClientVersion = (value: string): boolean =>
    parseVersion(value.trim()) !== undefined

export const normalizeRealityMinClientVersion = (value?: string): string => {
    if (value === undefined) return REALITY_MIN_CLIENT_VERSION_COMPAT
    const normalized = value.trim()
    if (!normalized) {
        throw new Error('Reality minClientVer must use x.y.z format.')
    }
    if (!validateRealityMinClientVersion(normalized)) {
        throw new Error('Reality minClientVer must use x.y.z format.')
    }
    return normalized
}

export const getRealityClientCompatibility = (
    minClientVer?: string | null
): RealityCompatibility => {
    const version = minClientVer?.trim() || REALITY_MIN_CLIENT_VERSION_COMPAT
    if (!validateRealityMinClientVersion(version)) {
        return { mihomo: false, singbox: false, xray: false }
    }
    return {
        mihomo:
            version === REALITY_CLIENT_COMPATIBILITY.unrestricted ||
            compareVersions(REALITY_CLIENT_COMPATIBILITY.mihomo, version) >= 0,
        singbox:
            version === REALITY_CLIENT_COMPATIBILITY.unrestricted ||
            compareVersions(REALITY_CLIENT_COMPATIBILITY.compatible, version) >= 0,
        xray:
            version === REALITY_CLIENT_COMPATIBILITY.unrestricted ||
            compareVersions(REALITY_CLIENT_COMPATIBILITY.xray, version) >= 0
    }
}

/** REALITY minClientVer is server-only; client outbound parsers must strip it. */
export const stripRealityServerOnlyFields = <T extends Record<string, unknown>>(
    streamSettings: T
): T => {
    if (streamSettings.security !== 'reality') return streamSettings
    const realitySettings = streamSettings.realitySettings
    if (!realitySettings || typeof realitySettings !== 'object' || Array.isArray(realitySettings)) {
        return streamSettings
    }
    const sanitized = { ...streamSettings, realitySettings: { ...realitySettings } } as T & {
        realitySettings: Record<string, unknown>
    }
    delete sanitized.realitySettings.minClientVer
    return sanitized
}

export const stripRealityServerOnlyFieldsFromOutbound = <T extends Record<string, unknown>>(
    outbound: T
): T => {
    const streamSettings = outbound.streamSettings
    if (!streamSettings || typeof streamSettings !== 'object' || Array.isArray(streamSettings)) {
        return outbound
    }
    return {
        ...outbound,
        streamSettings: stripRealityServerOnlyFields(streamSettings as Record<string, unknown>)
    } as T
}

export const getRealityMinClientVersion = (
    streamSettings: Record<string, unknown>
): string | undefined => {
    if (streamSettings.security !== 'reality') return undefined
    const realitySettings = streamSettings.realitySettings
    if (!realitySettings || typeof realitySettings !== 'object' || Array.isArray(realitySettings)) {
        return undefined
    }
    const value = (realitySettings as Record<string, unknown>).minClientVer
    return typeof value === 'string' ? value : undefined
}

export const setRealityMinClientVersion = <T extends Record<string, unknown>>(
    streamSettings: T,
    minClientVer: string
): T => {
    if (streamSettings.security !== 'reality') return streamSettings
    const realitySettings = streamSettings.realitySettings
    if (!realitySettings || typeof realitySettings !== 'object' || Array.isArray(realitySettings)) {
        return streamSettings
    }
    return {
        ...streamSettings,
        realitySettings: {
            ...(realitySettings as Record<string, unknown>),
            minClientVer: normalizeRealityMinClientVersion(minClientVer)
        }
    } as T
}

export const applyRealityCompatibilityToConfig = (
    config: Record<string, unknown>,
    minClientVer: string,
    onlyTags?: ReadonlySet<string>
): Record<string, unknown> => {
    const inbounds = config.inbounds
    if (!Array.isArray(inbounds)) return config

    const normalized = normalizeRealityMinClientVersion(minClientVer)
    return {
        ...config,
        inbounds: inbounds.map((value) => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return value
            const inbound = value as Record<string, unknown>
            const tag = typeof inbound.tag === 'string' ? inbound.tag : undefined
            if (onlyTags && (!tag || !onlyTags.has(tag))) return value
            const streamSettings = inbound.streamSettings
            if (
                !streamSettings ||
                typeof streamSettings !== 'object' ||
                Array.isArray(streamSettings) ||
                (streamSettings as Record<string, unknown>).security !== 'reality'
            ) {
                return value
            }
            return {
                ...inbound,
                streamSettings: setRealityMinClientVersion(
                    streamSettings as Record<string, unknown>,
                    normalized
                )
            }
        })
    }
}
