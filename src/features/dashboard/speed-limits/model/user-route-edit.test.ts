import type { UserRouteEditValues } from './user-route-edit.ts'

import assert from 'node:assert/strict'
import test from 'node:test'

import {
    buildUserRouteEditPatch,
    createUserRouteEditValues,
    hasUserRouteEditChanges,
    isUserRouteEditHoppingValid
} from './user-route-edit.ts'

const ROUTE_UUID = '00000000-0000-4000-8000-000000000001'
const INBOUND_UUID = '00000000-0000-4000-8000-000000000002'
const HOPPING_UUID = '00000000-0000-4000-8000-000000000003'
const SPEED_UUID = '00000000-0000-4000-8000-000000000004'
const OTHER_UUID = '00000000-0000-4000-8000-000000000005'

const route = Object.freeze({
    uuid: ROUTE_UUID,
    userId: 6,
    nodeUuid: '00000000-0000-4000-8000-000000000006',
    hostUuid: '00000000-0000-4000-8000-000000000007',
    configProfileInboundUuid: INBOUND_UUID,
    network: 'udp' as const,
    internalAddress: '127.0.0.1',
    internalPort: 35_579,
    externalPort: 32_000,
    enabled: true,
    speedLimitUuid: null as string | null,
    portHoppingConfigUuid: null as string | null
})
const hoppingConfig = Object.freeze({
    uuid: HOPPING_UUID,
    configProfileInboundUuid: INBOUND_UUID,
    enabled: true
})

test('prefills the existing speed policy and hopping binding into independent form values', () => {
    const boundRoute = { ...route, speedLimitUuid: SPEED_UUID, portHoppingConfigUuid: HOPPING_UUID }
    const values = createUserRouteEditValues(boundRoute)

    assert.deepEqual(values, {
        speedLimitUuid: SPEED_UUID,
        portHoppingConfigUuid: HOPPING_UUID
    })
    assert.notEqual(values, boundRoute)
})

test('adds a compatible enabled hopping pool to an existing standard UDP route', () => {
    const values = { ...createUserRouteEditValues(route), portHoppingConfigUuid: HOPPING_UUID }

    assert.equal(isUserRouteEditHoppingValid(route, values, [hoppingConfig]), true)
    assert.equal(hasUserRouteEditChanges(route, values), true)
    assert.deepEqual(buildUserRouteEditPatch(route, values), {
        uuid: ROUTE_UUID,
        portHoppingConfigUuid: HOPPING_UUID
    })
})

test('clears an existing hopping binding with an explicit null without changing canonical ports', () => {
    const boundRoute = { ...route, portHoppingConfigUuid: HOPPING_UUID }
    const values = { ...createUserRouteEditValues(boundRoute), portHoppingConfigUuid: null }

    assert.equal(isUserRouteEditHoppingValid(boundRoute, values, []), true)
    assert.equal(hasUserRouteEditChanges(boundRoute, values), true)
    assert.deepEqual(buildUserRouteEditPatch(boundRoute, values), {
        uuid: ROUTE_UUID,
        portHoppingConfigUuid: null
    })
})

test('a speed-only change omits hopping so it cannot reallocate an existing hopping range', () => {
    const boundRoute = { ...route, portHoppingConfigUuid: HOPPING_UUID }
    const values = { ...createUserRouteEditValues(boundRoute), speedLimitUuid: SPEED_UUID }
    const patch = buildUserRouteEditPatch(boundRoute, values)

    assert.equal(hasUserRouteEditChanges(boundRoute, values), true)
    assert.deepEqual(patch, { uuid: ROUTE_UUID, speedLimitUuid: SPEED_UUID })
    assert.equal(Object.hasOwn(patch, 'portHoppingConfigUuid'), false)
})

test('unlimited speed is saved as an explicit null without removing the hopping binding', () => {
    const boundRoute = { ...route, speedLimitUuid: SPEED_UUID, portHoppingConfigUuid: HOPPING_UUID }
    const values = { ...createUserRouteEditValues(boundRoute), speedLimitUuid: null }

    assert.deepEqual(buildUserRouteEditPatch(boundRoute, values), {
        uuid: ROUTE_UUID,
        speedLimitUuid: null
    })
})

test('unchanged or reverted form values produce no editable fields in the patch', () => {
    const values = createUserRouteEditValues(route)

    assert.equal(hasUserRouteEditChanges(route, values), false)
    assert.deepEqual(buildUserRouteEditPatch(route, values), { uuid: ROUTE_UUID })
    values.portHoppingConfigUuid = HOPPING_UUID
    assert.equal(hasUserRouteEditChanges(route, values), true)
    values.portHoppingConfigUuid = null
    assert.equal(hasUserRouteEditChanges(route, values), false)
    assert.deepEqual(buildUserRouteEditPatch(route, values), { uuid: ROUTE_UUID })
})

test('new hopping bindings reject a missing pool, disabled pool, or another inbound', () => {
    const values = { ...createUserRouteEditValues(route), portHoppingConfigUuid: HOPPING_UUID }

    assert.equal(isUserRouteEditHoppingValid(route, values, []), false)
    assert.equal(
        isUserRouteEditHoppingValid(route, values, [{ ...hoppingConfig, enabled: false }]),
        false
    )
    assert.equal(
        isUserRouteEditHoppingValid(route, values, [
            { ...hoppingConfig, configProfileInboundUuid: OTHER_UUID }
        ]),
        false
    )
    assert.equal(
        isUserRouteEditHoppingValid(route, values, [{ ...hoppingConfig, uuid: OTHER_UUID }]),
        false
    )
})

test('a TCP route cannot acquire a hopping binding even when its inbound matches the pool', () => {
    const tcpRoute = { ...route, network: 'tcp' as const }
    const values = { ...createUserRouteEditValues(tcpRoute), portHoppingConfigUuid: HOPPING_UUID }

    assert.equal(isUserRouteEditHoppingValid(tcpRoute, values, [hoppingConfig]), false)
})

test('an unchanged existing hopping binding remains valid if its pool is disabled or missing', () => {
    const boundRoute = { ...route, portHoppingConfigUuid: HOPPING_UUID }
    const values = { ...createUserRouteEditValues(boundRoute), speedLimitUuid: SPEED_UUID }

    assert.equal(isUserRouteEditHoppingValid(boundRoute, values, []), true)
    assert.equal(
        isUserRouteEditHoppingValid(boundRoute, values, [{ ...hoppingConfig, enabled: false }]),
        true
    )
    assert.equal(
        Object.hasOwn(buildUserRouteEditPatch(boundRoute, values), 'portHoppingConfigUuid'),
        false
    )
})

test('keeping or clearing a legacy TCP hopping value is allowed without adding a new binding', () => {
    const legacyRoute = { ...route, network: 'tcp' as const, portHoppingConfigUuid: HOPPING_UUID }
    const values = createUserRouteEditValues(legacyRoute)

    assert.equal(isUserRouteEditHoppingValid(legacyRoute, values, []), true)
    assert.equal(
        isUserRouteEditHoppingValid(legacyRoute, { ...values, portHoppingConfigUuid: null }, []),
        true
    )
    assert.equal(
        isUserRouteEditHoppingValid(legacyRoute, { ...values, portHoppingConfigUuid: OTHER_UUID }, [
            { ...hoppingConfig, uuid: OTHER_UUID }
        ]),
        false
    )
})

test('a standard route with hopping off does not require any pool', () => {
    assert.equal(isUserRouteEditHoppingValid(route, createUserRouteEditValues(route), []), true)
    const tcpRoute = { ...route, network: 'tcp' as const }
    assert.equal(
        isUserRouteEditHoppingValid(tcpRoute, createUserRouteEditValues(tcpRoute), []),
        true
    )
})

test('only editable changed fields are patched, never identity, ports, network, or enabled state', () => {
    const values = {
        ...route,
        uuid: OTHER_UUID,
        userId: 999,
        nodeUuid: OTHER_UUID,
        hostUuid: OTHER_UUID,
        configProfileInboundUuid: OTHER_UUID,
        network: 'tcp',
        internalAddress: '0.0.0.0',
        internalPort: 443,
        externalPort: 32_001,
        enabled: false,
        speedLimitUuid: SPEED_UUID,
        portHoppingConfigUuid: HOPPING_UUID
    }

    assert.deepEqual(buildUserRouteEditPatch(route, values), {
        uuid: ROUTE_UUID,
        speedLimitUuid: SPEED_UUID,
        portHoppingConfigUuid: HOPPING_UUID
    })
})

test('editing and cancelling never mutate the cached route and reopening restores saved values', () => {
    const firstValues: UserRouteEditValues = createUserRouteEditValues(route)
    firstValues.speedLimitUuid = SPEED_UUID
    firstValues.portHoppingConfigUuid = HOPPING_UUID

    const reopenedValues = createUserRouteEditValues(route)
    assert.deepEqual(reopenedValues, { speedLimitUuid: null, portHoppingConfigUuid: null })
    assert.notEqual(reopenedValues, firstValues)
    assert.equal(route.speedLimitUuid, null)
    assert.equal(route.portHoppingConfigUuid, null)
    assert.equal(route.externalPort, 32_000)
    assert.equal(hasUserRouteEditChanges(route, reopenedValues), false)
})

test('reopening after a successful save uses the refreshed server state', () => {
    const savedRoute = {
        ...route,
        speedLimitUuid: SPEED_UUID,
        portHoppingConfigUuid: HOPPING_UUID,
        hopStartPort: 53_000,
        hopEndPort: 53_199
    }
    const values = createUserRouteEditValues(savedRoute)

    assert.deepEqual(values, {
        speedLimitUuid: SPEED_UUID,
        portHoppingConfigUuid: HOPPING_UUID
    })
    assert.equal(hasUserRouteEditChanges(savedRoute, values), false)
    assert.deepEqual(buildUserRouteEditPatch(savedRoute, values), { uuid: ROUTE_UUID })
})
