import assert from 'node:assert/strict'
import test from 'node:test'

import { isPublicInboundCompatibilityAvailable, resolveGostTargetAddress } from './speed-limit.ts'
import {
    bytesPerSecondToMbps,
    getGostForwardNetwork,
    isHostCompatibleWithUserRoute,
    isExternalPortValid,
    isLoopbackAddress,
    isUserRouteFormReady,
    resolveInboundListenAddress,
    mbpsToBytesPerSecond
} from './speed-limit.ts'

test('converts decimal Mbps to bytes/sec using SI network units', () => {
    assert.equal(mbpsToBytesPerSecond(20), 2_500_000)
    assert.equal(mbpsToBytesPerSecond(100), 12_500_000)
    assert.equal(bytesPerSecondToMbps(6_250_000), 50)
})

test('keeps zero as the unlimited sentinel in both directions', () => {
    assert.equal(mbpsToBytesPerSecond(0), 0)
    assert.equal(bytesPerSecondToMbps(0), 0)
})

test('rejects invalid or negative rates', () => {
    assert.throws(() => mbpsToBytesPerSecond(-1))
    assert.throws(() => mbpsToBytesPerSecond(Number.NaN))
    assert.throws(() => bytesPerSecondToMbps(Number.POSITIVE_INFINITY))
})

test('accepts only explicit IP loopback listeners', () => {
    assert.equal(isLoopbackAddress('127.0.0.1'), true)
    assert.equal(isLoopbackAddress('::1'), true)
    assert.equal(isLoopbackAddress('localhost'), false)
    assert.equal(isLoopbackAddress('0.0.0.0'), false)
})

test('maps Hysteria to UDP and transparent Xray protocols to TCP', () => {
    assert.equal(getGostForwardNetwork('hysteria'), 'udp')
    assert.equal(getGostForwardNetwork('Hysteria2'), 'udp')
    assert.equal(getGostForwardNetwork('vless'), 'tcp')
    assert.equal(getGostForwardNetwork('trojan'), 'tcp')
})

const XRAY_PROFILE_UUID = '00000000-0000-4000-8000-000000000001'
const SINGBOX_PROFILE_UUID = '00000000-0000-4000-8000-000000000002'
const XRAY_INBOUND_UUID = '00000000-0000-4000-8000-000000000003'
const SINGBOX_INBOUND_UUID = '00000000-0000-4000-8000-000000000004'
const VMRACK_NODE_UUID = '00000000-0000-4000-8000-000000000005'
const OTHER_NODE_UUID = '00000000-0000-4000-8000-000000000006'

const host = (profileUuid: string, inboundUuid: string, nodes: string[] = []) => ({
    inbound: {
        configProfileInboundUuid: inboundUuid,
        configProfileUuid: profileUuid
    },
    nodes
})

test('shows Xray and sing-box hosts for their matching node inbound', () => {
    assert.equal(
        isHostCompatibleWithUserRoute(
            host(XRAY_PROFILE_UUID, XRAY_INBOUND_UUID, [VMRACK_NODE_UUID]),
            VMRACK_NODE_UUID,
            { profileUuid: XRAY_PROFILE_UUID, uuid: XRAY_INBOUND_UUID }
        ),
        true
    )
    assert.equal(
        isHostCompatibleWithUserRoute(
            host(SINGBOX_PROFILE_UUID, SINGBOX_INBOUND_UUID),
            VMRACK_NODE_UUID,
            { profileUuid: SINGBOX_PROFILE_UUID, uuid: SINGBOX_INBOUND_UUID }
        ),
        true
    )
})

test('does not mix hosts across nodes, inbounds, profiles, or cores', () => {
    assert.equal(
        isHostCompatibleWithUserRoute(
            host(SINGBOX_PROFILE_UUID, SINGBOX_INBOUND_UUID, [OTHER_NODE_UUID]),
            VMRACK_NODE_UUID,
            { profileUuid: SINGBOX_PROFILE_UUID, uuid: SINGBOX_INBOUND_UUID }
        ),
        false
    )
    assert.equal(
        isHostCompatibleWithUserRoute(
            host(SINGBOX_PROFILE_UUID, XRAY_INBOUND_UUID),
            VMRACK_NODE_UUID,
            { profileUuid: SINGBOX_PROFILE_UUID, uuid: SINGBOX_INBOUND_UUID }
        ),
        false
    )
    assert.equal(
        isHostCompatibleWithUserRoute(
            host(XRAY_PROFILE_UUID, SINGBOX_INBOUND_UUID),
            VMRACK_NODE_UUID,
            { profileUuid: SINGBOX_PROFILE_UUID, uuid: SINGBOX_INBOUND_UUID }
        ),
        false
    )
})

const selectedSingBoxInbound = {
    profileUuid: SINGBOX_PROFILE_UUID,
    uuid: SINGBOX_INBOUND_UUID,
    port: 35_579
}
const compatibleSingBoxHost = {
    uuid: '00000000-0000-4000-8000-000000000007',
    ...host(SINGBOX_PROFILE_UUID, SINGBOX_INBOUND_UUID)
}
const readyRouteForm = {
    userId: '6',
    nodeUuid: VMRACK_NODE_UUID,
    inboundUuid: SINGBOX_INBOUND_UUID,
    hostUuid: compatibleSingBoxHost.uuid,
    selectedInbound: selectedSingBoxInbound,
    selectedHost: compatibleSingBoxHost,
    internalAddress: '127.0.0.1',
    externalPort: '',
    portHoppingConfigUuid: null,
    safetyConfirmed: true
}

test('enables sing-box Hysteria2 route with an unrestricted host and automatic port', () => {
    assert.equal(isUserRouteFormReady(readyRouteForm), true)
    assert.equal(isExternalPortValid(''), true)
})

test('enables a standard Hysteria2 route with a valid manual external port', () => {
    assert.equal(isUserRouteFormReady({ ...readyRouteForm, externalPort: 32_123 }), true)
})

test('port hopping is optional and does not participate in base route readiness', () => {
    assert.equal(isUserRouteFormReady(readyRouteForm), true)
    assert.equal(
        isUserRouteFormReady({
            ...readyRouteForm,
            portHoppingConfigUuid: '00000000-0000-4000-8000-000000000008'
        }),
        true
    )
})

test('disables route submission without a host or confirmation', () => {
    assert.equal(
        isUserRouteFormReady({ ...readyRouteForm, hostUuid: null, selectedHost: undefined }),
        false
    )
    assert.equal(isUserRouteFormReady({ ...readyRouteForm, safetyConfirmed: false }), false)
})

test('disables route submission for an incompatible host', () => {
    assert.equal(
        isUserRouteFormReady({
            ...readyRouteForm,
            selectedHost: {
                ...compatibleSingBoxHost,
                nodes: [OTHER_NODE_UUID]
            }
        }),
        false
    )
})

test('accepts empty automatic port but rejects incomplete or invalid manual ports', () => {
    assert.equal(isExternalPortValid(''), true)
    assert.equal(isExternalPortValid('320'), false)
    assert.equal(isExternalPortValid(0), false)
    assert.equal(isExternalPortValid(65_536), false)
})

test('resolves sing-box listen address from profile config when list rawInbound omits it', () => {
    assert.equal(
        resolveInboundListenAddress(
            { type: 'hysteria2', tag: 'singbox-hysteria2-7jiv3', listen_port: 35_579 },
            {
                inbounds: [
                    {
                        type: 'hysteria2',
                        tag: 'singbox-hysteria2-7jiv3',
                        listen: '127.0.0.1',
                        listen_port: 35_579
                    }
                ]
            },
            'singbox-hysteria2-7jiv3'
        ),
        '127.0.0.1'
    )
})

test('public Xray compatibility is opt-in, requires acknowledgement and uses IPv4 loopback', () => {
    const form = {
        ...readyRouteForm,
        coreType: 'xray',
        internalAddress: '0.0.0.0',
        inboundUuid: XRAY_INBOUND_UUID,
        selectedInbound: { uuid: XRAY_INBOUND_UUID, profileUuid: XRAY_PROFILE_UUID, port: 34397 },
        selectedHost: {
            uuid: compatibleSingBoxHost.uuid,
            ...host(XRAY_PROFILE_UUID, XRAY_INBOUND_UUID)
        }
    }
    assert.equal(isUserRouteFormReady(form), false)
    assert.equal(isUserRouteFormReady({ ...form, allowPublicInbound: true }), true)
    assert.equal(
        isUserRouteFormReady({ ...form, allowPublicInbound: true, safetyConfirmed: false }),
        false
    )
    assert.equal(resolveGostTargetAddress('0.0.0.0', 'xray', true), '127.0.0.1')
    assert.equal(resolveGostTargetAddress('0.0.0.0', 'xray', false), undefined)
    assert.equal(resolveGostTargetAddress('::1', 'xray'), '::1')
})

test('public compatibility does not permit unknown/sing-box cores or arbitrary listen addresses', () => {
    for (const coreType of [undefined, 'singbox', 'unknown']) {
        assert.equal(isPublicInboundCompatibilityAvailable(coreType, '0.0.0.0'), false)
        assert.equal(resolveGostTargetAddress('0.0.0.0', coreType, true), undefined)
    }
    for (const listen of [undefined, '', '::', '192.0.2.1', 'localhost']) {
        assert.equal(isPublicInboundCompatibilityAvailable('xray', listen), false)
        assert.equal(resolveGostTargetAddress(listen, 'xray', true), undefined)
    }
})
