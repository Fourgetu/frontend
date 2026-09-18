import assert from 'node:assert/strict'
import test from 'node:test'

import {
    CORE_TYPE_MISSING_MESSAGE,
    getConfigProfileModelUri,
    preserveKnownCoreType,
    validateConfigForCore
} from './core-validation.ts'

const singboxConfig = JSON.stringify({
    inbounds: [
        {
            type: 'hysteria2',
            tag: 'singbox-hysteria2-test',
            listen: '127.0.0.1',
            listen_port: 35371,
            users: [],
            tls: {
                enabled: true,
                server_name: 'test.example.com'
            }
        }
    ],
    outbounds: [{ type: 'direct', tag: 'direct' }],
    route: { final: 'direct' }
})

test('Xray profiles use only the Xray WASM validator and Xray model URI', async () => {
    let xrayCalls = 0
    let singboxCalls = 0

    const result = await validateConfigForCore('xray', '{"inbounds":[]}', {
        xrayWasm: () => {
            xrayCalls += 1
            return undefined
        },
        singboxSchema: () => {
            singboxCalls += 1
            return undefined
        }
    })

    assert.equal(result.validator, 'xray-wasm')
    assert.equal(result.isValid, true)
    assert.equal(xrayCalls, 1)
    assert.equal(singboxCalls, 0)
    assert.match(getConfigProfileModelUri('xray', 'test-profile'), /^xray-config:\/\//)
})

test('sing-box profiles use only schema validation and preserve listen_port', async () => {
    let xrayCalls = 0
    let singboxCalls = 0

    const result = await validateConfigForCore('singbox', singboxConfig, {
        xrayWasm: () => {
            xrayCalls += 1
            return 'InboundDetour: Listen on specific ip without port'
        },
        singboxSchema: (value) => {
            singboxCalls += 1
            const parsed = JSON.parse(value) as {
                inbounds: Array<{ listen_port?: number; type?: string }>
            }
            assert.equal(parsed.inbounds[0]?.type, 'hysteria2')
            assert.equal(parsed.inbounds[0]?.listen_port, 35371)
            return undefined
        }
    })

    assert.equal(result.validator, 'singbox-schema')
    assert.equal(result.isValid, true)
    assert.equal(xrayCalls, 0)
    assert.equal(singboxCalls, 1)
    assert.doesNotMatch(result.message, /InboundDetour|specific ip without port/)
    assert.match(getConfigProfileModelUri('singbox', 'test-profile'), /^singbox-config:\/\//)
})

test('missing core type fails closed without invoking either validator', async () => {
    let xrayCalls = 0
    let singboxCalls = 0

    const result = await validateConfigForCore(undefined, singboxConfig, {
        xrayWasm: () => {
            xrayCalls += 1
            return undefined
        },
        singboxSchema: () => {
            singboxCalls += 1
            return undefined
        }
    })

    assert.equal(result.validator, 'missing')
    assert.equal(result.isValid, false)
    assert.equal(result.message, CORE_TYPE_MISSING_MESSAGE)
    assert.equal(xrayCalls, 0)
    assert.equal(singboxCalls, 0)
})

test('saving a sing-box profile preserves its known core type when an old response strips it', () => {
    const cached = preserveKnownCoreType('singbox', {
        uuid: 'test-profile',
        config: JSON.parse(singboxConfig)
    })

    assert.equal(cached.coreType, 'singbox')
})
