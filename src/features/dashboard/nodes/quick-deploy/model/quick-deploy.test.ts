import type { CreateHostCommand } from '@remnawave/backend-contract'

import assert from 'node:assert/strict'
import test from 'node:test'

import {
    PANEL_CERTIFICATE_URI,
    PANEL_PRIVATE_KEY_URI
} from '../../../../../shared/tls/managed-certificate.ts'
import {
    appendProtocolPresets,
    PROTOCOL_PRESETS,
    type XrayInbound
} from '../../../config-profiles/protocol-presets/model/protocol-presets.ts'
import { getQuickDeployCapability, type QuickDeployProtocolId } from './core-capabilities.ts'
import {
    createVirtualQuickDeployProfile,
    createQuickDeploymentPlan,
    executeQuickDeployment,
    type QuickDeployApi,
    type QuickDeployHost,
    type QuickDeployInboundRecord,
    type QuickDeployNode,
    type QuickDeployParameters,
    type QuickDeployProfile
} from './quick-deploy.ts'
import {
    appendSingBoxProtocolPresets,
    createMinimalSingBoxConfig,
    type SingBoxInbound
} from './singbox-protocol-presets.ts'
import { appendXrayQuickDeployPresets } from './xray-quick-deploy-presets.ts'

const TLS = {
    domain: 'edge.example.com',
    certificateFile: '/var/lib/remnawave/configs/xray/ssl/fullchain.pem',
    keyFile: '/var/lib/remnawave/configs/xray/ssl/privkey.key'
}

const PARAMETERS: QuickDeployParameters = {
    coreType: 'xray',
    nodeUuid: 'node-1',
    profileUuid: 'profile-1',
    presetIds: ['vless-reality-vision'],
    hostAddress: 'edge.example.com',
    reality: {
        minClientVer: '1.8.1',
        serverName: 'swdist.apple.com',
        targetDomain: 'swdist.apple.com',
        targetPort: 443
    },
    tls: TLS,
    serverDescription: 'Primary edge'
}

for (const coreType of ['xray', 'singbox'] as const) {
    for (const method of ['2022-blake3-aes-128-gcm', '2022-blake3-aes-256-gcm'] as const) {
        test(`Quick Deploy ${coreType} ${method}: correct profile, native inbound and Host port`, () => {
            const api = new FakeQuickDeployApi()
            const profile =
                coreType === 'xray'
                    ? api.profile
                    : { ...api.profile, coreType, config: createMinimalSingBoxConfig() }
            const plan = createQuickDeploymentPlan({
                node: api.node,
                profile,
                allProfiles: [profile],
                hosts: [],
                parameters: {
                    ...PARAMETERS,
                    coreType,
                    ss2022Method: method,
                    presetIds: [
                        coreType === 'xray' ? 'shadowsocks-2022' : 'singbox-shadowsocks-2022'
                    ]
                }
            })
            const inbound = plan.inbounds[0].inbound
            const fields =
                coreType === 'xray' ? (inbound.settings as Record<string, unknown>) : inbound
            assert.equal(fields.method, method)
            assert.equal(plan.inbounds[0].willCreateInbound, true)
            assert.equal(plan.inbounds[0].preset.coreType, coreType)
            assert.equal('streamSettings' in inbound, coreType === 'xray')
        })
    }
}

const toInboundRecord = (
    inbound: XrayInbound,
    uuid: string,
    profileUuid = 'profile-1'
): QuickDeployInboundRecord => ({
    uuid,
    profileUuid,
    tag: inbound.tag,
    type: inbound.protocol,
    network:
        typeof inbound.streamSettings.network === 'string' ? inbound.streamSettings.network : null,
    security:
        typeof inbound.streamSettings.security === 'string'
            ? inbound.streamSettings.security
            : null,
    port: inbound.port,
    rawInbound: inbound
})

const manualInbound = (): XrayInbound => ({
    tag: 'manual-vless',
    listen: '0.0.0.0',
    port: 24_000,
    protocol: 'vless',
    settings: { clients: [], decryption: 'none' },
    streamSettings: { network: 'raw', security: 'none' }
})

interface FakeOptions {
    failHostTitle?: string
    failNode?: string
    failProfile?: string
}

class FakeQuickDeployApi implements QuickDeployApi {
    public calls = { createHost: 0, getNode: 0, updateNode: 0, updateProfile: 0 }
    public hostBodies: CreateHostCommand.RequestBody[] = []
    public hosts: QuickDeployHost[] = []
    public node: QuickDeployNode
    public profile: QuickDeployProfile
    private hostSequence = 0
    private inboundSequence = 0
    private readonly options: FakeOptions

    constructor(
        existingInbounds: XrayInbound[] = [],
        activeInboundTags: string[] = [],
        options: FakeOptions = {}
    ) {
        this.options = options
        const records = existingInbounds.map((inbound, index) =>
            toInboundRecord(inbound, `inbound-existing-${index + 1}`)
        )
        this.profile = {
            uuid: 'profile-1',
            name: 'Main Profile',
            coreType: 'xray',
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            config: {
                inbounds: existingInbounds,
                outbounds: [{ tag: 'DIRECT', protocol: 'freedom' }],
                customUnknown: { keep: true }
            },
            inbounds: records
        }
        this.node = {
            uuid: 'node-1',
            name: 'Node One',
            address: '203.0.113.10',
            isConnected: true,
            isDisabled: false,
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            configProfile: {
                activeConfigProfileUuid: 'profile-1',
                activeInbounds: records.filter((record) => activeInboundTags.includes(record.tag))
            }
        }
    }

    public createProfile = async (): Promise<QuickDeployProfile> => {
        throw new Error('Unexpected Config Profile creation in this fixture.')
    }

    public createHost = async (body: CreateHostCommand.RequestBody): Promise<QuickDeployHost> => {
        this.calls.createHost += 1
        this.hostBodies.push(body)
        if (this.options.failHostTitle && body.remark.includes(this.options.failHostTitle)) {
            throw new Error(`Backend host error: ${this.options.failHostTitle}`)
        }

        this.hostSequence += 1
        const host: QuickDeployHost = {
            uuid: `host-${this.hostSequence}`,
            remark: body.remark,
            address: body.address,
            port: body.port,
            inbound: body.inbound,
            nodes: body.nodes ?? []
        }
        this.hosts.push(host)
        return structuredClone(host)
    }

    public getHosts = async (): Promise<QuickDeployHost[]> => structuredClone(this.hosts)

    public getNode = async (): Promise<QuickDeployNode> => {
        this.calls.getNode += 1
        return structuredClone(this.node)
    }

    public getProfile = async (): Promise<QuickDeployProfile> => structuredClone(this.profile)

    public getProfiles = async (): Promise<QuickDeployProfile[]> => [structuredClone(this.profile)]

    public updateNode = async (body: {
        configProfile?: { activeConfigProfileUuid: string; activeInbounds: string[] }
        singBoxConfigProfile?: { activeConfigProfileUuid: string; activeInbounds: string[] }
        uuid: string
    }): Promise<QuickDeployNode> => {
        this.calls.updateNode += 1
        if (this.options.failNode) throw new Error(this.options.failNode)

        if (!body.configProfile) throw new Error('Expected an Xray profile binding.')
        const binding = body.configProfile
        this.node.configProfile.activeConfigProfileUuid = binding.activeConfigProfileUuid
        this.node.configProfile.activeInbounds = this.profile.inbounds.filter((inbound) =>
            binding.activeInbounds.includes(inbound.uuid)
        )
        this.node.updatedAt = new Date('2026-01-01T00:02:00.000Z')
        return structuredClone(this.node)
    }

    public updateProfile = async (body: {
        config: Record<string, unknown>
        uuid: string
    }): Promise<QuickDeployProfile> => {
        this.calls.updateProfile += 1
        if (this.options.failProfile) throw new Error(this.options.failProfile)

        const rawInbounds = body.config.inbounds as XrayInbound[]
        const existingByTag = new Map(
            this.profile.inbounds.map((inbound) => [inbound.tag, inbound])
        )
        this.profile.config = structuredClone(body.config)
        this.profile.inbounds = rawInbounds.map((inbound) => {
            const existing = existingByTag.get(inbound.tag)
            if (existing && existing.type === inbound.protocol) {
                return toInboundRecord(inbound, existing.uuid)
            }

            this.inboundSequence += 1
            return toInboundRecord(inbound, `inbound-new-${this.inboundSequence}`)
        })
        this.profile.updatedAt = new Date('2026-01-01T00:01:00.000Z')
        return structuredClone(this.profile)
    }
}

const planFor = (api: FakeQuickDeployApi, overrides: Partial<QuickDeployParameters> = {}) =>
    createQuickDeploymentPlan({
        node: structuredClone(api.node),
        profile: structuredClone(api.profile),
        allProfiles: [structuredClone(api.profile)],
        hosts: structuredClone(api.hosts),
        parameters: { ...PARAMETERS, ...overrides }
    })

test('deploys one Reality Vision preset to one Node', async () => {
    const api = new FakeQuickDeployApi()
    const result = await executeQuickDeployment(planFor(api), api)

    assert.equal(result.outcome, 'success')
    assert.equal(api.profile.inbounds.length, 1)
    assert.equal(api.node.configProfile.activeInbounds.length, 1)
    assert.equal(api.hosts.length, 1)
})

test('Quick Deploy creates a new Reality Inbound with minClientVer 1.8.1', async () => {
    const api = new FakeQuickDeployApi()
    await executeQuickDeployment(planFor(api), api)

    const raw = api.profile.inbounds[0].rawInbound as XrayInbound
    assert.equal(
        (raw.streamSettings.realitySettings as Record<string, unknown>).minClientVer,
        '1.8.1'
    )
})

test('deploys all supported Xray recommendations without expanding HY2', async () => {
    const api = new FakeQuickDeployApi()
    const presetIds = PROTOCOL_PRESETS.filter(
        (preset) => preset.id !== 'mixed' && preset.recommended && preset.supported
    ).map((preset) => preset.id as QuickDeployProtocolId)
    const result = await executeQuickDeployment(planFor(api, { presetIds }), api)

    assert.equal(result.outcome, 'success')
    assert.equal(api.profile.inbounds.length, 3)
    assert.equal(api.node.configProfile.activeInbounds.length, 3)
    assert.equal(api.hosts.length, 3)
})

test('preserves Profile Inbounds that existed before deployment', async () => {
    const existing = manualInbound()
    const api = new FakeQuickDeployApi([existing])

    await executeQuickDeployment(planFor(api), api)

    assert.equal((api.profile.config as { inbounds: XrayInbound[] }).inbounds[0].tag, existing.tag)
})

test('preserves unknown Profile fields during deployment', async () => {
    const api = new FakeQuickDeployApi()

    await executeQuickDeployment(planFor(api), api)

    assert.deepEqual((api.profile.config as { customUnknown: unknown }).customUnknown, {
        keep: true
    })
})

test('preserves Node Inbounds already enabled in the same Profile', async () => {
    const existing = manualInbound()
    const api = new FakeQuickDeployApi([existing], [existing.tag])

    await executeQuickDeployment(planFor(api), api)

    assert.equal(api.node.configProfile.activeInbounds.length, 2)
    assert.ok(api.node.configProfile.activeInbounds.some((inbound) => inbound.tag === existing.tag))
})

test('binds each Host to the real Inbound UUID and selected Node', async () => {
    const api = new FakeQuickDeployApi()

    await executeQuickDeployment(planFor(api), api)

    assert.equal(api.hosts[0].inbound.configProfileInboundUuid, api.profile.inbounds[0].uuid)
    assert.deepEqual(api.hosts[0].nodes, ['node-1'])
})

test('maps Reality Vision Host fields from the generated Inbound', async () => {
    const api = new FakeQuickDeployApi()

    await executeQuickDeployment(planFor(api), api)

    const body = api.hostBodies[0]
    assert.equal(body.port, api.profile.inbounds[0].port)
    assert.equal(body.sni, PARAMETERS.reality.serverName)
    assert.equal(body.path, null)
    assert.equal(body.fingerprint, 'chrome')
    assert.equal(body.securityLayer, 'DEFAULT')
})

test('custom Reality values drive Preview, Profile, and Host for Vision and gRPC', async () => {
    for (const presetId of ['vless-reality-vision', 'vless-reality-grpc'] as const) {
        const api = new FakeQuickDeployApi()
        const plan = planFor(api, { presetIds: [presetId] })
        const plannedReality = (plan.inbounds[0].inbound as XrayInbound).streamSettings
            .realitySettings as Record<string, unknown>

        assert.equal(plannedReality.target, 'swdist.apple.com:443')
        assert.deepEqual(plannedReality.serverNames, ['swdist.apple.com'])
        assert.equal(plannedReality.minClientVer, '1.8.1')
        assert.equal(plan.inbounds[0].domainOrServerName, 'swdist.apple.com')
        assert.equal(plan.hosts[0].sni, 'swdist.apple.com')

        await executeQuickDeployment(plan, api)

        const savedReality = (api.profile.inbounds[0].rawInbound as XrayInbound).streamSettings
            .realitySettings as Record<string, unknown>
        assert.equal(savedReality.target, 'swdist.apple.com:443')
        assert.deepEqual(savedReality.serverNames, ['swdist.apple.com'])
        assert.equal(api.hostBodies[0].sni, 'swdist.apple.com')
        const serialized = JSON.stringify({ plan, host: api.hostBodies[0] })
        assert.equal(serialized.includes('www.intel.com'), false)
        assert.equal(serialized.includes('www.microsoft.com'), false)
    }
})

test('Reality gRPC has no Vision flow and maps serviceName to Host path', async () => {
    const api = new FakeQuickDeployApi()

    await executeQuickDeployment(planFor(api, { presetIds: ['vless-reality-grpc'] }), api)

    const raw = api.profile.inbounds[0].rawInbound as XrayInbound
    assert.equal(raw.settings.flow, '')
    assert.equal(
        api.hostBodies[0].path,
        (raw.streamSettings.grpcSettings as { serviceName: string }).serviceName
    )
})

test('blocks Trojan TLS deployment when its domain is missing', () => {
    const api = new FakeQuickDeployApi()

    assert.throws(() =>
        planFor(api, {
            presetIds: ['trojan-tcp-tls'],
            tls: { ...TLS, domain: '' }
        })
    )
})

test('Xray Hysteria2 provisioning stays closed without mutating profiles or Hosts', () => {
    const api = new FakeQuickDeployApi()
    assert.throws(() => planFor(api, { presetIds: ['hysteria2'] }), /not supported/)
    assert.equal(api.calls.updateProfile, 0)
    assert.equal(api.calls.createHost, 0)
})

test('a second identical deployment creates no duplicate Inbound or Host', async () => {
    const api = new FakeQuickDeployApi()

    await executeQuickDeployment(planFor(api), api)
    const secondResult = await executeQuickDeployment(planFor(api), api)

    assert.equal(secondResult.outcome, 'success')
    assert.equal(api.profile.inbounds.length, 1)
    assert.equal(api.hosts.length, 1)
    assert.equal(api.calls.updateProfile, 1)
    assert.equal(api.calls.createHost, 1)
})

test('reusing an existing Reality Inbound does not change its minClientVer', async () => {
    const existing = appendProtocolPresets({}, ['vless-reality-vision'], {
        reality: {
            minClientVer: '26.3.27',
            serverName: 'www.microsoft.com',
            targetDomain: 'www.microsoft.com',
            targetPort: 443
        }
    }).added[0].inbound
    const api = new FakeQuickDeployApi([existing])

    await executeQuickDeployment(planFor(api), api)

    const raw = api.profile.inbounds[0].rawInbound as XrayInbound
    assert.equal(
        (raw.streamSettings.realitySettings as Record<string, unknown>).minClientVer,
        '26.3.27'
    )
    assert.equal(
        (raw.streamSettings.realitySettings as Record<string, unknown>).target,
        'www.microsoft.com:443'
    )
    assert.deepEqual((raw.streamSettings.realitySettings as Record<string, unknown>).serverNames, [
        'www.microsoft.com'
    ])
    assert.equal(api.calls.updateProfile, 0)
})

test('explicit compatibility update changes only the selected existing Reality Inbound', async () => {
    const existing = appendProtocolPresets({}, ['vless-reality-vision'], {
        reality: {
            serverName: 'www.example.com',
            targetDomain: 'www.example.com',
            targetPort: 443
        }
    }).added[0].inbound
    const api = new FakeQuickDeployApi([existing])

    await executeQuickDeployment(planFor(api, { updateExistingRealityCompatibility: true }), api)

    const raw = api.profile.inbounds[0].rawInbound as XrayInbound
    assert.equal(
        (raw.streamSettings.realitySettings as Record<string, unknown>).minClientVer,
        '1.8.1'
    )
    assert.equal(api.calls.updateProfile, 1)
})

test('requires a refreshed preview and preserves an external Profile modification', async () => {
    const api = new FakeQuickDeployApi()
    const firstPlan = planFor(api)
    api.profile.config = {
        ...(api.profile.config as Record<string, unknown>),
        externallyAdded: { keep: 'yes' }
    }
    api.profile.updatedAt = new Date('2026-01-01T00:00:30.000Z')

    const staleResult = await executeQuickDeployment(firstPlan, api)
    assert.equal(staleResult.outcome, 'review-required')
    assert.equal(api.calls.updateProfile, 0)
    assert.ok(staleResult.refreshedPlan)

    await executeQuickDeployment(staleResult.refreshedPlan!, api)
    assert.deepEqual((api.profile.config as { externallyAdded: unknown }).externallyAdded, {
        keep: 'yes'
    })
})

test('stops all later steps when Config Profile update fails', async () => {
    const api = new FakeQuickDeployApi([], [], { failProfile: 'Profile validation rejected' })
    const result = await executeQuickDeployment(planFor(api), api)

    assert.equal(result.configProfile.status, 'failed')
    assert.equal(result.configProfile.message, 'Profile validation rejected')
    assert.equal(api.calls.updateNode, 0)
    assert.equal(api.calls.createHost, 0)
    assert.equal(result.rollback.status, 'skipped')
})

test('records Node enable failure and does not create Hosts', async () => {
    const api = new FakeQuickDeployApi([], [], { failNode: 'Node inbound rejected' })
    const result = await executeQuickDeployment(planFor(api), api)

    assert.equal(result.outcome, 'partial')
    assert.equal(result.nodeInbounds.status, 'failed')
    assert.equal(result.nodeInbounds.message, 'Node inbound rejected')
    assert.equal(api.calls.createHost, 0)
})

test('records one Host failure while retaining other successful Hosts', async () => {
    const api = new FakeQuickDeployApi([], [], { failHostTitle: 'Trojan' })
    const result = await executeQuickDeployment(
        planFor(api, { presetIds: ['vless-reality-vision', 'trojan-tcp-tls'] }),
        api
    )

    assert.equal(result.outcome, 'partial')
    assert.equal(result.hosts[0].status, 'success')
    assert.equal(result.hosts[1].status, 'failed')
    assert.equal(api.hosts.length, 1)
})

test('preserves backend error text in per-Host results', async () => {
    const api = new FakeQuickDeployApi([], [], { failHostTitle: 'Trojan' })
    const result = await executeQuickDeployment(
        planFor(api, { presetIds: ['trojan-tcp-tls'] }),
        api
    )

    assert.match(result.hosts[0].message!, /Backend host error: Trojan/)
})

test('VMess remains unavailable to the deployment planner', () => {
    const api = new FakeQuickDeployApi()

    assert.throws(() => planFor(api, { presetIds: ['vmess-ws-tls'] }), /not supported/i)
})

const toSingBoxInboundRecord = (
    inbound: SingBoxInbound,
    uuid: string,
    profileUuid: string
): QuickDeployInboundRecord => ({
    uuid,
    profileUuid,
    tag: inbound.tag,
    type: inbound.type,
    network: inbound.type === 'hysteria2' ? 'udp' : 'tcp',
    security: inbound.tls ? 'tls' : null,
    port: inbound.listen_port,
    rawInbound: inbound
})

for (const presetId of [
    'singbox-hysteria2',
    'singbox-vless-reality-vision',
    'singbox-shadowsocks-2022'
] as const) {
    test(`first ${presetId} Quick Deploy creates Host and preserves the Xray Profile slot`, async () => {
        const xrayInbound = toInboundRecord(manualInbound(), 'xray-inbound', 'xray-profile')
        const node: QuickDeployNode = {
            uuid: 'node-1',
            name: 'Node One',
            address: '203.0.113.10',
            isConnected: true,
            isDisabled: false,
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            configProfile: {
                activeConfigProfileUuid: 'xray-profile',
                activeSingBoxConfigProfileUuid: null,
                activeInbounds: [xrayInbound]
            }
        }
        let createdProfile: QuickDeployProfile | undefined
        const createdHosts: QuickDeployHost[] = []
        let createProfileCalls = 0
        let updateProfileCalls = 0

        const api: QuickDeployApi = {
            getNode: async () => structuredClone(node),
            getProfiles: async () => (createdProfile ? [structuredClone(createdProfile)] : []),
            getProfile: async () => {
                if (!createdProfile) throw new Error('Profile not found')
                return structuredClone(createdProfile)
            },
            getHosts: async () => structuredClone(createdHosts),
            createProfile: async (body) => {
                createProfileCalls += 1
                const inbounds = (body.config.inbounds as SingBoxInbound[]).map((inbound, index) =>
                    toSingBoxInboundRecord(
                        inbound,
                        `singbox-inbound-${index + 1}`,
                        'singbox-profile'
                    )
                )
                createdProfile = {
                    uuid: 'singbox-profile',
                    name: body.name,
                    coreType: body.coreType,
                    config: structuredClone(body.config),
                    inbounds,
                    updatedAt: new Date('2026-01-01T00:01:00.000Z')
                }
                return structuredClone(createdProfile)
            },
            updateProfile: async () => {
                updateProfileCalls += 1
                throw new Error('Auto-created profile must not be patched a second time.')
            },
            updateNode: async (body) => {
                if (!body.singBoxConfigProfile || !createdProfile) {
                    throw new Error('Expected a sing-box profile binding.')
                }
                node.configProfile.activeSingBoxConfigProfileUuid =
                    body.singBoxConfigProfile.activeConfigProfileUuid
                node.configProfile.activeInbounds = [
                    xrayInbound,
                    ...createdProfile.inbounds.filter((inbound) =>
                        body.singBoxConfigProfile!.activeInbounds.includes(inbound.uuid)
                    )
                ]
                return structuredClone(node)
            },
            createHost: async (body) => {
                const host: QuickDeployHost = {
                    uuid: 'singbox-host',
                    remark: body.remark,
                    address: body.address,
                    port: body.port,
                    inbound: body.inbound,
                    nodes: body.nodes ?? []
                }
                createdHosts.push(host)
                return structuredClone(host)
            }
        }

        const profile = createVirtualQuickDeployProfile('singbox', node)
        const parameters: QuickDeployParameters = {
            ...PARAMETERS,
            coreType: 'singbox',
            profileUuid: profile.uuid,
            presetIds: [presetId]
        }
        const plan = createQuickDeploymentPlan({
            node: structuredClone(node),
            profile,
            allProfiles: [],
            hosts: [],
            parameters
        })
        const inbound = plan.inbounds[0].inbound as SingBoxInbound
        assert.equal(
            inbound.type,
            presetId === 'singbox-hysteria2'
                ? 'hysteria2'
                : presetId === 'singbox-vless-reality-vision'
                  ? 'vless'
                  : 'shadowsocks'
        )
        assert.equal(inbound.listen, '127.0.0.1')
        if (inbound.type !== 'shadowsocks')
            assert.equal((inbound.tls as { enabled: boolean }).enabled, true)
        if (inbound.type === 'vless') {
            assert.equal(plan.hosts[0].security, 'reality')
            assert.equal(plan.hosts[0].sni, PARAMETERS.reality.serverName)
            assert.ok(plan.inbounds[0].realityPublicKey)
        }

        const result = await executeQuickDeployment(plan, api)

        assert.equal(result.outcome, 'success')
        assert.equal(createProfileCalls, 1)
        assert.equal(updateProfileCalls, 0)
        assert.equal(node.configProfile.activeConfigProfileUuid, 'xray-profile')
        assert.equal(node.configProfile.activeSingBoxConfigProfileUuid, 'singbox-profile')
        assert.ok(node.configProfile.activeInbounds.some((item) => item.uuid === 'xray-inbound'))
        assert.ok(
            node.configProfile.activeInbounds.some((item) => item.uuid === 'singbox-inbound-1')
        )
        assert.equal(createdHosts[0].inbound.configProfileUuid, 'singbox-profile')
        assert.equal(createdHosts[0].address, PARAMETERS.hostAddress)
        // Execution refreshes the plan against current server state. Hosts must
        // reference the saved inbound, not an earlier preview's random port.
        assert.ok(createdProfile)
        assert.equal(
            createdHosts[0].port,
            (createdProfile.inbounds[0].rawInbound as SingBoxInbound).listen_port
        )
    })
}

test('production capability gate blocks AnyTLS and SOCKS until their panel E2E passes', () => {
    const node = new FakeQuickDeployApi().node
    const profile = createVirtualQuickDeployProfile('singbox', node)
    for (const presetId of ['singbox-anytls', 'singbox-socks5'] as const) {
        assert.throws(
            () =>
                createQuickDeploymentPlan({
                    node,
                    profile,
                    allProfiles: [],
                    hosts: [],
                    parameters: {
                        ...PARAMETERS,
                        coreType: 'singbox',
                        profileUuid: profile.uuid,
                        presetIds: [presetId]
                    }
                }),
            /not supported for production/i
        )
    }
})

test('SOCKS capability keeps TCP and UDP acceptance status independent', () => {
    for (const presetId of ['xray-socks5', 'singbox-socks5'] as const) {
        const capability = getQuickDeployCapability(presetId)
        assert.equal(capability.availability, 'disabled')
        assert.equal(capability.status, 'experimental')
        assert.equal(capability.udpStatus, 'experimental')
    }
})

test('experimental sing-box builders create authenticated runtime-ready AnyTLS and SOCKS inbounds', () => {
    const result = appendSingBoxProtocolPresets(
        createMinimalSingBoxConfig(),
        ['singbox-anytls', 'singbox-socks5'],
        { tls: TLS }
    )
    const anyTls = result.added[0].inbound
    const socks = result.added[1].inbound

    assert.equal(anyTls.type, 'anytls')
    assert.equal(anyTls.listen, '127.0.0.1')
    assert.deepEqual(anyTls.users, [])
    assert.deepEqual((anyTls.tls as { alpn: string[] }).alpn, ['h2', 'http/1.1'])

    assert.equal(socks.type, 'socks')
    assert.equal(socks.listen, '127.0.0.1')
    assert.deepEqual(socks.users, [])
    assert.notEqual(anyTls.listen_port, socks.listen_port)
})

test('sing-box TLS presets use managed panel certificate markers when selected', () => {
    const result = appendSingBoxProtocolPresets(
        createMinimalSingBoxConfig(),
        ['singbox-hysteria2'],
        {
            tls: {
                domain: 'panel.example.com',
                certificateFile: '',
                keyFile: '',
                source: 'panel'
            }
        }
    )
    const tls = result.added[0].inbound.tls as Record<string, unknown>
    assert.equal(tls.certificate_path, PANEL_CERTIFICATE_URI)
    assert.equal(tls.key_path, PANEL_PRIVATE_KEY_URI)
})

test('experimental Xray SOCKS builder requires password auth and loopback GOST mode', () => {
    const result = appendXrayQuickDeployPresets(
        { inbounds: [], outbounds: [{ protocol: 'freedom' }] },
        ['xray-socks5']
    )
    const inbound = result.added[0].inbound
    assert.equal(inbound.protocol, 'socks')
    assert.equal(inbound.listen, '127.0.0.1')
    assert.equal(inbound.settings.auth, 'password')
    assert.equal(inbound.settings.udp, true)
    assert.deepEqual(inbound.settings.accounts, [])
})

test('Mixed Quick Deploy creates and assigns Xray inbound while Host stays optional', async () => {
    const api = new FakeQuickDeployApi()
    const plan = planFor(api, {
        presetIds: ['xray-mixed'],
        hostAddress: '',
        createOptionalHosts: false
    })
    const inbound = plan.inbounds[0].inbound as XrayInbound
    assert.equal(inbound.protocol, 'mixed')
    assert.equal(inbound.listen, '127.0.0.1')
    assert.equal(plan.hosts[0].enabled, false)
    assert.equal(plan.hosts[0].willCreateHost, false)

    const result = await executeQuickDeployment(plan, api)
    assert.equal(result.outcome, 'success')
    assert.equal(api.node.configProfile.activeInbounds.length, 1)
    assert.equal(api.hosts.length, 0)
    assert.equal(result.hosts[0].status, 'skipped')
})

test('Mixed Quick Deploy can create a Host only after explicit opt-in', async () => {
    const api = new FakeQuickDeployApi()
    const plan = planFor(api, {
        presetIds: ['xray-mixed'],
        hostAddress: 'mixed.example.com',
        createOptionalHosts: true
    })
    assert.equal(plan.hosts[0].enabled, true)
    assert.equal(plan.hosts[0].willCreateHost, true)
    await executeQuickDeployment(plan, api)
    assert.equal(api.hosts.length, 1)
})

test('sing-box Mixed builder remains separate from Xray JSON', () => {
    const result = appendSingBoxProtocolPresets(createMinimalSingBoxConfig(), ['singbox-mixed'], {
        tls: TLS
    })
    const inbound = result.added[0].inbound
    assert.equal(inbound.type, 'mixed')
    assert.equal(inbound.listen, '127.0.0.1')
    assert.deepEqual(inbound.users, [])
    assert.equal((inbound as Record<string, unknown>).protocol, undefined)
})
