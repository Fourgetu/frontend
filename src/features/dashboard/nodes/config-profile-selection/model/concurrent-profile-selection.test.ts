import assert from 'node:assert/strict'
import test from 'node:test'

import {
    ConcurrentCreateNodeRequestBodySchema,
    ConcurrentNodeSchema,
    ConcurrentUpdateNodeRequestBodySchema
} from '../../../../../shared/api/types/concurrent-node.schema.ts'
import {
    clearCoreProfileSelection,
    createConcurrentProfileBindingsFromNode,
    createConcurrentProfileSelection,
    selectCoreProfileInbounds,
    toConcurrentProfileBindings,
    toggleCoreProfileInbound
} from './concurrent-profile-selection.ts'

const binding = (profileUuid: string, ...activeInbounds: string[]) => ({
    activeConfigProfileUuid: profileUuid,
    activeInbounds
})

const NODE_UUID = '00000000-0000-4000-8000-000000000001'
const XRAY_PROFILE_UUID = '00000000-0000-4000-8000-000000000002'
const SINGBOX_PROFILE_UUID = '00000000-0000-4000-8000-000000000003'
const XRAY_INBOUND_UUID = '00000000-0000-4000-8000-000000000004'
const SINGBOX_INBOUND_UUID = '00000000-0000-4000-8000-000000000005'

test('keeps an Xray-only selection', () => {
    const state = createConcurrentProfileSelection({
        configProfile: binding('xray-profile', 'xray-1'),
        singBoxConfigProfile: null
    })

    assert.deepEqual(toConcurrentProfileBindings(state), {
        configProfile: binding('xray-profile', 'xray-1'),
        singBoxConfigProfile: null
    })
})

test('keeps a sing-box-only selection', () => {
    const state = createConcurrentProfileSelection({
        configProfile: null,
        singBoxConfigProfile: binding('singbox-profile', 'singbox-1')
    })

    assert.deepEqual(toConcurrentProfileBindings(state), {
        configProfile: null,
        singBoxConfigProfile: binding('singbox-profile', 'singbox-1')
    })
})

test('saves Xray and sing-box selections together', () => {
    const state = createConcurrentProfileSelection({
        configProfile: binding('xray-profile', 'xray-1', 'xray-2', 'xray-3'),
        singBoxConfigProfile: binding('singbox-profile', 'singbox-1')
    })

    assert.deepEqual(toConcurrentProfileBindings(state), {
        configProfile: binding('xray-profile', 'xray-1', 'xray-2', 'xray-3'),
        singBoxConfigProfile: binding('singbox-profile', 'singbox-1')
    })
})

test('round-trips both selections after a save and refresh', () => {
    const initial = createConcurrentProfileSelection({
        configProfile: binding('xray-profile', 'xray-1', 'xray-2'),
        singBoxConfigProfile: binding('singbox-profile', 'singbox-1')
    })
    const refreshed = createConcurrentProfileSelection(toConcurrentProfileBindings(initial))

    assert.deepEqual(toConcurrentProfileBindings(refreshed), toConcurrentProfileBindings(initial))
})

test('GET response preserves both profile slots and rebuilds their inbounds after refresh', () => {
    const nodeConfigProfile = ConcurrentNodeSchema.shape.configProfile.parse({
        activeConfigProfileUuid: XRAY_PROFILE_UUID,
        activeSingBoxConfigProfileUuid: SINGBOX_PROFILE_UUID,
        activeInbounds: [
            {
                uuid: XRAY_INBOUND_UUID,
                profileUuid: XRAY_PROFILE_UUID,
                tag: 'vless-lazy',
                type: 'vless',
                network: 'tcp',
                security: 'reality',
                port: 443,
                rawInbound: {}
            },
            {
                uuid: SINGBOX_INBOUND_UUID,
                profileUuid: SINGBOX_PROFILE_UUID,
                tag: 'singbox-hysteria2-test',
                type: 'hysteria2',
                network: 'udp',
                security: 'tls',
                port: 35371,
                rawInbound: {}
            }
        ]
    })

    assert.deepEqual(createConcurrentProfileBindingsFromNode(nodeConfigProfile), {
        configProfile: binding(XRAY_PROFILE_UUID, XRAY_INBOUND_UUID),
        singBoxConfigProfile: binding(SINGBOX_PROFILE_UUID, SINGBOX_INBOUND_UUID)
    })
})

test('clearing Xray does not affect sing-box', () => {
    const initial = createConcurrentProfileSelection({
        configProfile: binding('xray-profile', 'xray-1'),
        singBoxConfigProfile: binding('singbox-profile', 'singbox-1')
    })
    const state = clearCoreProfileSelection(initial, 'xray')

    assert.deepEqual(toConcurrentProfileBindings(state), {
        configProfile: null,
        singBoxConfigProfile: binding('singbox-profile', 'singbox-1')
    })
})

test('clearing sing-box does not affect Xray', () => {
    const initial = createConcurrentProfileSelection({
        configProfile: binding('xray-profile', 'xray-1'),
        singBoxConfigProfile: binding('singbox-profile', 'singbox-1')
    })
    const state = clearCoreProfileSelection(initial, 'singbox')

    assert.deepEqual(toConcurrentProfileBindings(state), {
        configProfile: binding('xray-profile', 'xray-1'),
        singBoxConfigProfile: null
    })
})

test('changing Xray inbounds does not affect sing-box', () => {
    const initial = createConcurrentProfileSelection({
        configProfile: binding('xray-profile', 'xray-1'),
        singBoxConfigProfile: binding('singbox-profile', 'singbox-1')
    })
    const state = toggleCoreProfileInbound(initial, {
        coreType: 'xray',
        inboundUuid: 'xray-2',
        profileUuid: 'xray-profile'
    })

    assert.deepEqual(toConcurrentProfileBindings(state), {
        configProfile: binding('xray-profile', 'xray-1', 'xray-2'),
        singBoxConfigProfile: binding('singbox-profile', 'singbox-1')
    })
})

test('changing sing-box inbounds does not affect Xray', () => {
    const initial = createConcurrentProfileSelection({
        configProfile: binding('xray-profile', 'xray-1'),
        singBoxConfigProfile: binding('singbox-profile', 'singbox-1')
    })
    const state = selectCoreProfileInbounds(initial, {
        coreType: 'singbox',
        inboundUuids: ['singbox-2'],
        profileUuid: 'singbox-profile-2'
    })

    assert.deepEqual(toConcurrentProfileBindings(state), {
        configProfile: binding('xray-profile', 'xray-1'),
        singBoxConfigProfile: binding('singbox-profile-2', 'singbox-2')
    })
})

test('update mutation schema preserves both core profile payloads', () => {
    assert.deepEqual(
        ConcurrentUpdateNodeRequestBodySchema.parse({
            uuid: NODE_UUID,
            configProfile: binding(XRAY_PROFILE_UUID, XRAY_INBOUND_UUID),
            singBoxConfigProfile: binding(SINGBOX_PROFILE_UUID, SINGBOX_INBOUND_UUID)
        }),
        {
            uuid: NODE_UUID,
            configProfile: binding(XRAY_PROFILE_UUID, XRAY_INBOUND_UUID),
            singBoxConfigProfile: binding(SINGBOX_PROFILE_UUID, SINGBOX_INBOUND_UUID)
        }
    )
})

test('create mutation schema preserves a sing-box-only payload', () => {
    const result = ConcurrentCreateNodeRequestBodySchema.parse({
        address: '127.0.0.1',
        configProfile: null,
        countryCode: 'US',
        isTrafficTrackingActive: false,
        name: 'VMrack',
        singBoxConfigProfile: binding(SINGBOX_PROFILE_UUID, SINGBOX_INBOUND_UUID)
    })

    assert.equal(result.configProfile, null)
    assert.deepEqual(
        result.singBoxConfigProfile,
        binding(SINGBOX_PROFILE_UUID, SINGBOX_INBOUND_UUID)
    )
})
