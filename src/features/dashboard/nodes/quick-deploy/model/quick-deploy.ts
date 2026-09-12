import type { CreateHostCommand } from '@remnawave/backend-contract'

import {
    appendProtocolPresets,
    PROTOCOL_PRESETS,
    type BuiltProtocolPreset,
    type ProtocolPresetBuildOptions,
    type XrayInbound
} from '../../../config-profiles/protocol-presets/model/protocol-presets.ts'
import {
    applyRealityCompatibilityToConfig,
    normalizeRealityMinClientVersion,
    setRealityMinClientVersion
} from '../../../config-profiles/protocol-presets/model/reality-compatibility.ts'
import {
    assertQuickDeployCapabilityEnabled,
    getQuickDeployCapability,
    type CoreCapability,
    type ProxyCoreType,
    type QuickDeployProtocolId
} from './core-capabilities.ts'
import {
    appendSingBoxProtocolPresets,
    createMinimalSingBoxConfig,
    type BuiltSingBoxPreset,
    type SingBoxInbound
} from './singbox-protocol-presets.ts'
import {
    appendXrayQuickDeployPresets,
    type BuiltXrayQuickDeployPreset
} from './xray-quick-deploy-presets.ts'

export type DeploymentItemStatus = 'failed' | 'pending' | 'skipped' | 'success' | 'unconfirmed'

export interface QuickDeployInboundRecord {
    network: null | string
    port: null | number
    profileUuid: string
    rawInbound: unknown
    security: null | string
    tag: string
    type: string
    uuid: string
}

export interface QuickDeployProfile {
    config: unknown
    coreType?: ProxyCoreType
    inbounds: QuickDeployInboundRecord[]
    isVirtual?: boolean
    name: string
    updatedAt: Date | string
    uuid: string
}

export interface QuickDeployNode {
    address: string
    configProfile: {
        activeConfigProfileUuid: null | string
        activeSingBoxConfigProfileUuid?: null | string
        activeInbounds: QuickDeployInboundRecord[]
    }
    isConnected: boolean
    isDisabled: boolean
    name: string
    updatedAt: Date | string
    uuid: string
}

export interface QuickDeployHost {
    address: string
    inbound: {
        configProfileInboundUuid: null | string
        configProfileUuid: null | string
    }
    nodes: string[]
    port: number
    remark: string
    uuid: string
}

export interface QuickDeployParameters {
    coreType: ProxyCoreType
    hostAddress: string
    nodeUuid: string
    presetIds: readonly QuickDeployProtocolId[]
    profileUuid: string
    reality: {
        minClientVer?: string
        serverName: string
        target: string
    }
    updateExistingRealityCompatibility?: boolean
    serverDescription?: string
    tls: {
        certificateFile: string
        domain: string
        keyFile: string
    }
}

export interface PlannedInbound {
    domainOrServerName: string
    existingInboundUuid?: string
    inbound: QuickDeployInbound
    preset: CoreCapability
    presetId: QuickDeployProtocolId
    realityPublicKey?: string
    willUpdateInbound: boolean
    willCreateInbound: boolean
}

export interface PlannedHost {
    address: string
    existingHostUuid?: string
    inboundTag: string
    path: null | string
    port: number
    presetId: QuickDeployProtocolId
    security: string
    sni: null | string
    transport: string
    willCreateHost: boolean
}

export interface QuickDeploymentPlan {
    config: Record<string, unknown>
    hosts: PlannedHost[]
    inbounds: PlannedInbound[]
    node: QuickDeployNode
    nodeWillSwitchProfile: boolean
    parameters: QuickDeployParameters
    profile: QuickDeployProfile
    profileRevision: string
}

export interface DeploymentStepResult {
    message?: string
    resourceUuid?: string
    status: DeploymentItemStatus
}

export interface HostDeploymentResult extends DeploymentStepResult {
    presetId: QuickDeployProtocolId
}

export interface DeploymentResult {
    configProfile: DeploymentStepResult
    hosts: HostDeploymentResult[]
    nodeApply: DeploymentStepResult
    nodeInbounds: DeploymentStepResult
    outcome: 'failed' | 'partial' | 'review-required' | 'success'
    refreshedPlan?: QuickDeploymentPlan
    rollback: DeploymentStepResult
}

export interface QuickDeployApi {
    createProfile: (body: {
        config: Record<string, unknown>
        coreType: ProxyCoreType
        name: string
    }) => Promise<QuickDeployProfile>
    createHost: (body: CreateHostCommand.RequestBody) => Promise<QuickDeployHost>
    getHosts: () => Promise<QuickDeployHost[]>
    getNode: (uuid: string) => Promise<QuickDeployNode>
    getProfile: (uuid: string) => Promise<QuickDeployProfile>
    getProfiles: () => Promise<QuickDeployProfile[]>
    updateNode: (body: {
        configProfile?: { activeConfigProfileUuid: string; activeInbounds: string[] }
        singBoxConfigProfile?: { activeConfigProfileUuid: string; activeInbounds: string[] }
        uuid: string
    }) => Promise<QuickDeployNode>
    updateProfile: (body: {
        config: Record<string, unknown>
        uuid: string
    }) => Promise<QuickDeployProfile>
}

export const AUTO_PROFILE_UUID = '__quick-deploy-auto-profile__'

export const createVirtualQuickDeployProfile = (
    coreType: ProxyCoreType,
    node: Pick<QuickDeployNode, 'name'>
): QuickDeployProfile => ({
    uuid: AUTO_PROFILE_UUID,
    name: `${node.name} ${coreType === 'xray' ? 'Xray' : 'sing-box'}`.slice(0, 30),
    coreType,
    isVirtual: true,
    updatedAt: new Date(0),
    inbounds: [],
    config:
        coreType === 'singbox'
            ? createMinimalSingBoxConfig()
            : {
                  log: { loglevel: 'warning' },
                  inbounds: [],
                  outbounds: [{ tag: 'DIRECT', protocol: 'freedom' }]
              }
})

export interface CreateQuickDeploymentPlanInput {
    allProfiles: readonly QuickDeployProfile[]
    hosts: readonly QuickDeployHost[]
    node: QuickDeployNode
    parameters: QuickDeployParameters
    profile: QuickDeployProfile
}

export type QuickDeployInbound = SingBoxInbound | XrayInbound

const asRecord = (value: unknown, name: string): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${name} must be a JSON object.`)
    }

    return value as Record<string, unknown>
}

const revisionOf = (value: Date | string): string =>
    value instanceof Date ? value.toISOString() : new Date(value).toISOString()

const inboundFromRecord = (record: QuickDeployInboundRecord): QuickDeployInbound =>
    asRecord(record.rawInbound, `Inbound ${record.tag}`) as QuickDeployInbound

const withRealityMinClientVersion = (inbound: XrayInbound, minClientVer: string): XrayInbound => {
    const streamSettings = getStreamSettings(inbound)
    if (getString(streamSettings, 'security') !== 'reality') return inbound
    return {
        ...inbound,
        streamSettings: setRealityMinClientVersion(streamSettings, minClientVer)
    }
}

const xrayPresetIds = new Set(PROTOCOL_PRESETS.map((preset) => preset.id))

export const getPresetIdFromTag = (tag: string): QuickDeployProtocolId | undefined =>
    (
        [
            'vless-reality-vision',
            'vless-reality-grpc',
            'trojan-tcp-tls',
            'vmess-ws-tls',
            'hysteria2',
            'xray-socks5',
            'xray-xhttp',
            'singbox-hysteria2',
            'singbox-anytls',
            'singbox-socks5',
            'singbox-hysteria2-port-hopping'
        ] as const
    ).find((id) => tag.startsWith(`${id}-`))

const getString = (record: Record<string, unknown>, key: string): string | undefined =>
    typeof record[key] === 'string' ? (record[key] as string) : undefined

const getStreamSettings = (inbound: QuickDeployInbound): Record<string, unknown> =>
    asRecord(inbound.streamSettings, `streamSettings for ${inbound.tag}`)

const isXrayInbound = (inbound: QuickDeployInbound): inbound is XrayInbound =>
    typeof inbound.protocol === 'string'

const getInboundPort = (inbound: QuickDeployInbound): number =>
    isXrayInbound(inbound) ? inbound.port : inbound.listen_port

const getDomainOrServerName = (inbound: QuickDeployInbound): string => {
    if (!isXrayInbound(inbound)) {
        const tls = inbound.tls
        if (!tls || typeof tls !== 'object' || Array.isArray(tls)) return ''
        return getString(tls as Record<string, unknown>, 'server_name') ?? ''
    }
    const stream = getStreamSettings(inbound)
    const security = getString(stream, 'security')

    if (security === 'reality') {
        const reality = asRecord(stream.realitySettings, `realitySettings for ${inbound.tag}`)
        const names = reality.serverNames
        return Array.isArray(names) && typeof names[0] === 'string' ? names[0] : ''
    }

    if (security === 'tls') {
        const tls = asRecord(stream.tlsSettings, `tlsSettings for ${inbound.tag}`)
        return getString(tls, 'serverName') ?? ''
    }

    return ''
}

const getHostPath = (inbound: QuickDeployInbound): null | string => {
    if (!isXrayInbound(inbound)) return null
    const stream = getStreamSettings(inbound)
    const network = getString(stream, 'network')

    if (network === 'grpc') {
        return (
            getString(
                asRecord(stream.grpcSettings, `grpcSettings for ${inbound.tag}`),
                'serviceName'
            ) ?? null
        )
    }

    if (network === 'ws') {
        return (
            getString(asRecord(stream.wsSettings, `wsSettings for ${inbound.tag}`), 'path') ?? null
        )
    }

    return null
}

const getHostAlpn = (inbound: QuickDeployInbound): CreateHostCommand.RequestBody['alpn'] => {
    if (!isXrayInbound(inbound)) {
        const tls = inbound.tls
        if (!tls || typeof tls !== 'object' || Array.isArray(tls)) return null
        const alpn = (tls as Record<string, unknown>).alpn
        if (!Array.isArray(alpn)) return null
        const value = alpn.filter((item): item is string => typeof item === 'string').join(',')
        return value === 'h3' || value === 'h2,http/1.1' ? value : null
    }
    const stream = getStreamSettings(inbound)
    if (getString(stream, 'security') !== 'tls') return null

    const tls = asRecord(stream.tlsSettings, `tlsSettings for ${inbound.tag}`)
    const alpn = tls.alpn
    if (!Array.isArray(alpn)) return null

    const value = alpn.filter((item): item is string => typeof item === 'string').join(',')
    if (value === 'h3' || value === 'h2' || value === 'http/1.1' || value === 'h2,http/1.1') {
        return value
    }
    if (value === 'h3,h2' || value === 'h3,h2,http/1.1') return value

    return null
}

const findExistingInbound = (
    profile: QuickDeployProfile,
    presetId: QuickDeployProtocolId
): QuickDeployInboundRecord | undefined =>
    profile.inbounds.find(
        (inbound) =>
            inbound.tag.startsWith(`${presetId}-`) &&
            inbound.rawInbound !== null &&
            typeof inbound.rawInbound === 'object'
    )

const findExistingHost = (
    hosts: readonly QuickDeployHost[],
    inboundUuid: string | undefined,
    address: string,
    port: number
): QuickDeployHost | undefined => {
    if (!inboundUuid) return undefined

    return hosts.find(
        (host) =>
            host.inbound.configProfileInboundUuid === inboundUuid &&
            host.address === address &&
            host.port === port
    )
}

const toPlannedInbound = (
    presetId: QuickDeployProtocolId,
    inbound: QuickDeployInbound,
    existingInboundUuid?: string,
    built?: BuiltProtocolPreset | BuiltSingBoxPreset | BuiltXrayQuickDeployPreset,
    willUpdateInbound = false
): PlannedInbound => ({
    presetId,
    preset: getQuickDeployCapability(presetId),
    inbound,
    existingInboundUuid,
    realityPublicKey:
        built && 'realityPublicKey' in built ? built.realityPublicKey : undefined,
    willUpdateInbound,
    willCreateInbound: !existingInboundUuid,
    domainOrServerName: getDomainOrServerName(inbound)
})

const validateParameters = (parameters: QuickDeployParameters): void => {
    if (!parameters.nodeUuid) throw new Error('A Node is required.')
    if (!parameters.profileUuid) throw new Error('A Config Profile is required.')
    if (!parameters.hostAddress.trim()) throw new Error('A Host address is required.')
    if (parameters.presetIds.length === 0) throw new Error('At least one protocol is required.')
    if (new Set(parameters.presetIds).size !== parameters.presetIds.length) {
        throw new Error('Protocol selections must be unique.')
    }

    for (const id of parameters.presetIds) {
        assertQuickDeployCapabilityEnabled(parameters.coreType, id)
    }
}

export const createQuickDeploymentPlan = (
    input: CreateQuickDeploymentPlanInput
): QuickDeploymentPlan => {
    const { allProfiles, hosts, node, parameters, profile } = input
    validateParameters(parameters)

    if (node.uuid !== parameters.nodeUuid)
        throw new Error('Selected Node does not match parameters.')
    if (profile.uuid !== parameters.profileUuid) {
        throw new Error('Selected Config Profile does not match parameters.')
    }
    const profileCoreType = profile.coreType ?? 'xray'
    if (profileCoreType !== parameters.coreType) {
        throw new Error(
            `Selected Config Profile belongs to ${profileCoreType}, not ${parameters.coreType}.`
        )
    }

    const config = asRecord(profile.config, 'Config Profile config')
    const existingByPreset = new Map(
        parameters.presetIds.flatMap((presetId) => {
            const inbound = findExistingInbound(profile, presetId)
            return inbound ? [[presetId, inbound] as const] : []
        })
    )
    const missingPresetIds = parameters.presetIds.filter((id) => !existingByPreset.has(id))
    const reservedTags = allProfiles.flatMap((item) => item.inbounds.map((inbound) => inbound.tag))
    const reservedPorts = allProfiles.flatMap((item) =>
        item.inbounds.flatMap((inbound) => (inbound.port === null ? [] : [inbound.port]))
    )
    const generated = (() => {
        if (parameters.coreType === 'singbox') {
            return appendSingBoxProtocolPresets(config, missingPresetIds, {
                tls: parameters.tls,
                reservedTags,
                reservedPorts
            })
        }

        const standard = appendProtocolPresets(
            config,
            missingPresetIds.filter((id) => xrayPresetIds.has(id as never)) as never[],
            {
                reality: {
                    ...parameters.reality,
                    minClientVer: normalizeRealityMinClientVersion(parameters.reality.minClientVer)
                },
                tls: parameters.tls,
                reservedTags
            } satisfies ProtocolPresetBuildOptions
        )
        const quickDeployOnly = appendXrayQuickDeployPresets(
            standard.config,
            missingPresetIds.filter((id) => id === 'xray-socks5'),
            { reservedTags, reservedPorts }
        )
        return { config: quickDeployOnly.config, added: [...standard.added, ...quickDeployOnly.added] }
    })()
    const builtByPreset = new Map(
        generated.added.map((item) => [
            'preset' in item ? item.preset.id : item.presetId,
            item
        ])
    )

    const inbounds = parameters.presetIds.map((presetId) => {
        const existing = existingByPreset.get(presetId)
        if (existing) {
            const existingInbound = inboundFromRecord(existing)
            const shouldUpdateCompatibility =
                parameters.coreType === 'xray' &&
                Boolean(parameters.updateExistingRealityCompatibility) &&
                isXrayInbound(existingInbound) &&
                getString(getStreamSettings(existingInbound), 'security') === 'reality'
            const inbound = shouldUpdateCompatibility
                ? withRealityMinClientVersion(
                      existingInbound as XrayInbound,
                      normalizeRealityMinClientVersion(parameters.reality.minClientVer)
                  )
                : existingInbound
            return toPlannedInbound(
                presetId,
                inbound,
                existing.uuid,
                undefined,
                shouldUpdateCompatibility
            )
        }

        const built = builtByPreset.get(presetId)
        if (!built) throw new Error(`Failed to build protocol preset: ${presetId}`)
        return toPlannedInbound(presetId, built.inbound, undefined, built)
    })

    const compatibilityUpdateTags = new Set(
        inbounds.filter((item) => item.willUpdateInbound).map((item) => item.inbound.tag)
    )
    const plannedConfig = parameters.coreType === 'xray' && compatibilityUpdateTags.size
        ? applyRealityCompatibilityToConfig(
              generated.config,
              normalizeRealityMinClientVersion(parameters.reality.minClientVer),
              compatibilityUpdateTags
          )
        : generated.config

    const normalizedAddress = parameters.hostAddress.trim()
    const plannedHosts = inbounds.map((item): PlannedHost => {
        const existingHost = findExistingHost(
            hosts,
            item.existingInboundUuid,
            normalizedAddress,
            getInboundPort(item.inbound)
        )
        const transport = isXrayInbound(item.inbound)
            ? (getString(getStreamSettings(item.inbound), 'network') ?? 'tcp')
            : item.inbound.type === 'hysteria2'
              ? 'udp'
              : 'tcp'
        const security = isXrayInbound(item.inbound)
            ? (getString(getStreamSettings(item.inbound), 'security') ?? 'none')
            : item.inbound.tls
              ? 'tls'
              : 'none'

        return {
            presetId: item.presetId,
            inboundTag: item.inbound.tag,
            address: normalizedAddress,
            port: getInboundPort(item.inbound),
            path: getHostPath(item.inbound),
            sni: item.domainOrServerName || null,
            transport,
            security,
            existingHostUuid: existingHost?.uuid,
            willCreateHost: !existingHost
        }
    })

    return {
        parameters,
        node,
        profile,
        config: plannedConfig,
        inbounds,
        hosts: plannedHosts,
        nodeWillSwitchProfile:
            (parameters.coreType === 'xray'
                ? node.configProfile.activeConfigProfileUuid
                : node.configProfile.activeSingBoxConfigProfileUuid) !== null &&
            (parameters.coreType === 'xray'
                ? node.configProfile.activeConfigProfileUuid
                : node.configProfile.activeSingBoxConfigProfileUuid) !== profile.uuid,
        profileRevision: revisionOf(profile.updatedAt)
    }
}

const buildHostBody = (
    plan: QuickDeploymentPlan,
    item: PlannedInbound,
    inboundUuid: string
): CreateHostCommand.RequestBody => {
    const stream = isXrayInbound(item.inbound) ? getStreamSettings(item.inbound) : undefined
    const path = getHostPath(item.inbound)
    const serverName = item.domainOrServerName || null

    return {
        inbound: {
            configProfileUuid: plan.profile.uuid,
            configProfileInboundUuid: inboundUuid
        },
        remark: `${plan.node.name} · ${item.preset.title}`.slice(0, 100),
        address: plan.parameters.hostAddress.trim(),
        port: getInboundPort(item.inbound),
        path,
        sni: serverName,
        host: null,
        alpn: getHostAlpn(item.inbound),
        fingerprint:
            stream && getString(stream, 'security') === 'none'
                ? null
                : item.preset.security.includes('TLS') || item.preset.security === 'Reality'
                  ? 'chrome'
                  : null,
        securityLayer: 'DEFAULT',
        isDisabled: false,
        serverDescription: plan.parameters.serverDescription?.trim().slice(0, 30) || null,
        nodes: [plan.node.uuid]
    }
}

const failedStep = (error: unknown): DeploymentStepResult => ({
    status: 'failed',
    message: error instanceof Error ? error.message : String(error)
})

const skippedStep = (message: string): DeploymentStepResult => ({ status: 'skipped', message })

const pendingResult = (): DeploymentResult => ({
    outcome: 'failed',
    configProfile: { status: 'pending' },
    nodeInbounds: { status: 'pending' },
    hosts: [],
    nodeApply: { status: 'pending' },
    rollback: skippedStep(
        'Automatic rollback is intentionally disabled because the existing APIs cannot restore all resources atomically.'
    )
})

const hasSameRevision = (profile: QuickDeployProfile, plan: QuickDeploymentPlan): boolean =>
    revisionOf(profile.updatedAt) === plan.profileRevision

export const executeQuickDeployment = async (
    plan: QuickDeploymentPlan,
    api: QuickDeployApi
): Promise<DeploymentResult> => {
    const result = pendingResult()
    let latestNode: QuickDeployNode
    let latestProfile: QuickDeployProfile
    let latestHosts: QuickDeployHost[]
    let allProfiles: QuickDeployProfile[]

    try {
        ;[latestNode, latestHosts, allProfiles] = await Promise.all([
            api.getNode(plan.node.uuid),
            api.getHosts(),
            api.getProfiles()
        ])
        latestProfile = plan.profile.isVirtual
            ? plan.profile
            : await api.getProfile(plan.profile.uuid)
    } catch (error) {
        result.configProfile = failedStep(error)
        result.nodeInbounds = skippedStep('Preflight refresh failed.')
        result.hosts = plan.inbounds.map((item) => ({
            presetId: item.presetId,
            ...skippedStep('Host creation was not attempted.')
        }))
        result.nodeApply = skippedStep('Deployment did not start.')
        return result
    }

    let freshPlan: QuickDeploymentPlan
    try {
        freshPlan = createQuickDeploymentPlan({
            node: latestNode,
            profile: latestProfile,
            hosts: latestHosts,
            allProfiles,
            parameters: plan.parameters
        })
    } catch (error) {
        result.configProfile = failedStep(error)
        result.nodeInbounds = skippedStep('Preflight validation failed.')
        result.hosts = plan.inbounds.map((item) => ({
            presetId: item.presetId,
            ...skippedStep('Host creation was not attempted.')
        }))
        result.nodeApply = skippedStep('Deployment did not start.')
        return result
    }

    if (!plan.profile.isVirtual && !hasSameRevision(latestProfile, plan)) {
        return {
            ...result,
            outcome: 'review-required',
            configProfile: skippedStep(
                'Config Profile changed after preview. Review the refreshed plan.'
            ),
            nodeInbounds: skippedStep('Waiting for refreshed preview confirmation.'),
            nodeApply: skippedStep('Deployment did not start.'),
            refreshedPlan: freshPlan
        }
    }

    let deployedProfile = latestProfile
    if (freshPlan.profile.isVirtual) {
        const activeProfileUuid =
            freshPlan.parameters.coreType === 'xray'
                ? latestNode.configProfile.activeConfigProfileUuid
                : latestNode.configProfile.activeSingBoxConfigProfileUuid
        if (activeProfileUuid) {
            result.configProfile = skippedStep(
                `${freshPlan.parameters.coreType} received an active Profile after preview. Review before deploying.`
            )
            result.nodeInbounds = skippedStep('Waiting for a refreshed preview.')
            result.nodeApply = skippedStep('Deployment did not start.')
            result.outcome = 'review-required'
            return result
        }
        try {
            deployedProfile = await api.createProfile({
                name: freshPlan.profile.name,
                coreType: freshPlan.parameters.coreType,
                config: freshPlan.config
            })
            result.configProfile = {
                status: 'success',
                message: `Created and validated a minimal ${freshPlan.parameters.coreType} Config Profile.`,
                resourceUuid: deployedProfile.uuid
            }
        } catch (error) {
            result.configProfile = failedStep(error)
            result.nodeInbounds = skippedStep('Stopped because Config Profile creation failed.')
            result.hosts = freshPlan.inbounds.map((item) => ({
                presetId: item.presetId,
                ...skippedStep('Host creation was not attempted.')
            }))
            result.nodeApply = skippedStep('Deployment did not reach Node apply.')
            return result
        }
    } else if (freshPlan.inbounds.some((item) => item.willCreateInbound || item.willUpdateInbound)) {
        try {
            deployedProfile = await api.updateProfile({
                uuid: latestProfile.uuid,
                config: freshPlan.config
            })
            result.configProfile = {
                status: 'success',
                message: 'Config Profile updated; affected Nodes were queued for reload.',
                resourceUuid: deployedProfile.uuid
            }
        } catch (error) {
            result.configProfile = failedStep(error)
            result.nodeInbounds = skippedStep('Stopped because Config Profile update failed.')
            result.hosts = freshPlan.inbounds.map((item) => ({
                presetId: item.presetId,
                ...skippedStep('Host creation was not attempted.')
            }))
            result.nodeApply = skippedStep('Deployment did not reach Node apply.')
            return result
        }
    } else {
        result.configProfile = skippedStep('All selected preset Inbounds already exist.')
    }

    const deployedPlan: QuickDeploymentPlan = {
        ...freshPlan,
        profile: deployedProfile,
        parameters: { ...freshPlan.parameters, profileUuid: deployedProfile.uuid }
    }
    const inboundUuidByTag = new Map(
        deployedProfile.inbounds.map((inbound) => [inbound.tag, inbound.uuid])
    )
    const selectedInboundUuids: string[] = []
    for (const item of freshPlan.inbounds) {
        const uuid = inboundUuidByTag.get(item.inbound.tag)
        if (!uuid) {
            result.nodeInbounds = failedStep(
                new Error(`Updated Profile did not return Inbound ${item.inbound.tag}.`)
            )
            result.hosts = freshPlan.inbounds.map((planned) => ({
                presetId: planned.presetId,
                ...skippedStep('Host creation was not attempted.')
            }))
            result.nodeApply = skippedStep('Deployment did not reach Node apply.')
            result.outcome = 'partial'
            return result
        }
        selectedInboundUuids.push(uuid)
    }
    const activeProfileUuid =
        freshPlan.parameters.coreType === 'xray'
            ? latestNode.configProfile.activeConfigProfileUuid
            : latestNode.configProfile.activeSingBoxConfigProfileUuid
    const sameProfile = activeProfileUuid === deployedProfile.uuid
    const activeInboundUuids = sameProfile
        ? Array.from(
              new Set([
                  ...latestNode.configProfile.activeInbounds
                      .filter((inbound) => inbound.profileUuid === deployedProfile.uuid)
                      .map((inbound) => inbound.uuid),
                  ...selectedInboundUuids
              ])
          )
        : selectedInboundUuids
    const nodeAlreadyConfigured =
        sameProfile &&
        selectedInboundUuids.every((uuid) =>
            latestNode.configProfile.activeInbounds.some((inbound) => inbound.uuid === uuid)
        )

    if (nodeAlreadyConfigured) {
        result.nodeInbounds = skippedStep('Selected Inbounds are already enabled on this Node.')
    } else {
        try {
            latestNode = await api.updateNode({
                uuid: latestNode.uuid,
                ...(freshPlan.parameters.coreType === 'xray'
                    ? {
                          configProfile: {
                              activeConfigProfileUuid: deployedProfile.uuid,
                              activeInbounds: activeInboundUuids
                          }
                      }
                    : {
                          singBoxConfigProfile: {
                              activeConfigProfileUuid: deployedProfile.uuid,
                              activeInbounds: activeInboundUuids
                          }
                      })
            })
            result.nodeInbounds = {
                status: 'success',
                message: sameProfile
                    ? 'Enabled selected Inbounds and preserved the Node’s existing Inbounds.'
                    : 'Switched the Node to the selected Profile and enabled selected Inbounds.',
                resourceUuid: latestNode.uuid
            }
        } catch (error) {
            result.nodeInbounds = failedStep(error)
            result.nodeApply = skippedStep(
                'Stopped before Host creation because Node update failed.'
            )
            result.hosts = freshPlan.inbounds.map((item) => ({
                presetId: item.presetId,
                ...skippedStep('Host creation was not attempted.')
            }))
            result.outcome = 'partial'
            return result
        }
    }

    try {
        latestHosts = await api.getHosts()
    } catch (error) {
        result.hosts = freshPlan.inbounds.map((item) => ({
            presetId: item.presetId,
            ...failedStep(error)
        }))
        result.nodeApply = {
            status: 'unconfirmed',
            message: 'Node update was queued, but Host preflight failed.'
        }
        result.outcome = 'partial'
        return result
    }

    for (const item of freshPlan.inbounds) {
        const inboundUuid = inboundUuidByTag.get(item.inbound.tag)!
        const existingHost = findExistingHost(
            latestHosts,
            inboundUuid,
            deployedPlan.parameters.hostAddress.trim(),
            getInboundPort(item.inbound)
        )

        if (existingHost) {
            result.hosts.push({
                presetId: item.presetId,
                ...skippedStep('A matching Host already exists.'),
                resourceUuid: existingHost.uuid
            })
            continue
        }

        try {
            const created = await api.createHost(buildHostBody(deployedPlan, item, inboundUuid))
            latestHosts.push(created)
            result.hosts.push({
                presetId: item.presetId,
                status: 'success',
                message: 'Host created and bound to the Config Profile Inbound.',
                resourceUuid: created.uuid
            })
        } catch (error) {
            result.hosts.push({ presetId: item.presetId, ...failedStep(error) })
        }
    }

    try {
        const verifiedNode = await api.getNode(latestNode.uuid)
        const verifiedProfileUuid =
            freshPlan.parameters.coreType === 'xray'
                ? verifiedNode.configProfile.activeConfigProfileUuid
                : verifiedNode.configProfile.activeSingBoxConfigProfileUuid
        const linked =
            verifiedProfileUuid === deployedProfile.uuid &&
            selectedInboundUuids.every((uuid) =>
                verifiedNode.configProfile.activeInbounds.some((inbound) => inbound.uuid === uuid)
            )
        result.nodeApply = {
            status: 'unconfirmed',
            message: linked
                ? `${freshPlan.parameters.coreType} Profile and Inbound associations are confirmed; Node is ${verifiedNode.isConnected ? 'online' : 'offline'}. Runtime health is reported separately.`
                : `${freshPlan.parameters.coreType} Node associations could not be confirmed.`
        }
    } catch (error) {
        result.nodeApply = {
            status: 'unconfirmed',
            message: `Could not refresh Node status: ${failedStep(error).message}`
        }
    }

    const hasFailure = result.hosts.some((item) => item.status === 'failed')
    result.outcome = hasFailure ? 'partial' : 'success'
    return result
}
