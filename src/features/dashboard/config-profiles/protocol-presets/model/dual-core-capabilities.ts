export type ManagedCore = 'xray' | 'singbox'
export const SS2022_METHODS = [
    {
        method: '2022-blake3-aes-128-gcm',
        keyBytes: 16,
        xray: true,
        singbox: true,
        managedUsers: true,
        quickDeploy: true,
        quickProtocol: true
    },
    {
        method: '2022-blake3-aes-256-gcm',
        keyBytes: 32,
        xray: true,
        singbox: true,
        managedUsers: true,
        quickDeploy: true,
        quickProtocol: true
    },
    {
        method: '2022-blake3-chacha20-poly1305',
        keyBytes: 32,
        xray: true,
        singbox: true,
        managedUsers: false,
        quickDeploy: false,
        quickProtocol: false
    }
] as const
export type Ss2022Method = (typeof SS2022_METHODS)[number]['method']
export const DEFAULT_SS2022_METHOD: Ss2022Method = '2022-blake3-aes-128-gcm'

// Core protocol support is distinct from the managed provisioning pipeline.
export const DUAL_CORE_CAPABILITIES = [
    {
        protocol: 'vless-reality-vision',
        provisioningCores: ['xray', 'singbox'],
        xraySupported: true,
        singBoxSupported: true,
        managedUsers: true,
        quickProtocol: true,
        quickDeploy: true,
        subscription: true,
        tls: true,
        reality: true,
        gostCompatible: true,
        udp: true,
        portHopping: false
    },
    {
        protocol: 'shadowsocks-2022',
        provisioningCores: ['xray', 'singbox'],
        xraySupported: true,
        singBoxSupported: true,
        managedUsers: true,
        quickProtocol: true,
        quickDeploy: true,
        subscription: true,
        tls: false,
        reality: false,
        gostCompatible: true,
        udp: true,
        portHopping: false
    },
    // Native Trojan support alone does not certify the sing-box certificate/deployment pipeline.
    {
        protocol: 'trojan-tcp-tls',
        provisioningCores: ['xray'],
        xraySupported: true,
        singBoxSupported: true,
        managedUsers: true,
        quickProtocol: true,
        quickDeploy: true,
        subscription: true,
        tls: true,
        reality: false,
        gostCompatible: true,
        udp: true,
        portHopping: false
    },
    // Traditional AEAD in sing-box is single-user; VMess lacks a managed adapter here.
    {
        protocol: 'shadowsocks-aead',
        provisioningCores: [],
        xraySupported: true,
        singBoxSupported: true,
        managedUsers: false,
        quickProtocol: false,
        quickDeploy: false,
        subscription: false,
        tls: false,
        reality: false,
        gostCompatible: true,
        udp: true,
        portHopping: false
    },
    {
        protocol: 'vmess',
        provisioningCores: [],
        xraySupported: true,
        singBoxSupported: true,
        managedUsers: false,
        quickProtocol: false,
        quickDeploy: false,
        subscription: false,
        tls: false,
        reality: false,
        gostCompatible: true,
        udp: true,
        portHopping: false
    },
    {
        protocol: 'hysteria2',
        provisioningCores: ['singbox'],
        xraySupported: true,
        singBoxSupported: true,
        managedUsers: true,
        quickProtocol: true,
        quickDeploy: true,
        subscription: true,
        tls: true,
        reality: false,
        gostCompatible: true,
        udp: true,
        portHopping: true
    }
] as const

export const getProtocolPipeline = (core: ManagedCore, id: string) => {
    const protocol = id.replace(/^singbox-/, '')
    const capability = DUAL_CORE_CAPABILITIES.find((item) => item.protocol === protocol)
    if (!capability) return undefined
    const enabled = (capability.provisioningCores as readonly string[]).includes(core)
    return {
        ...capability,
        quickProtocol: enabled && capability.quickProtocol,
        quickDeploy: enabled && capability.quickDeploy
    }
}

export const getManagedSs2022Method = (method: string = DEFAULT_SS2022_METHOD) => {
    const capability = SS2022_METHODS.find((item) => item.method === method)
    if (!capability?.managedUsers)
        throw new Error('SS2022 method is unavailable for Managed Users.')
    return capability
}

export const generateSs2022ServerPassword = (method: string = DEFAULT_SS2022_METHOD): string => {
    const bytes = new Uint8Array(getManagedSs2022Method(method).keyBytes)
    globalThis.crypto.getRandomValues(bytes)
    return btoa(String.fromCharCode(...bytes))
}
