import assert from 'node:assert/strict'
import test from 'node:test'

import {
    bytesPerSecondToMbps,
    getGostForwardNetwork,
    isHostCompatibleWithUserRoute,
    isLoopbackAddress,
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
