import assert from 'node:assert/strict'
import test from 'node:test'

import {
    CORE_TYPE_MISSING_MESSAGE,
    getConfigProfileModelUri,
    isUsableCoreSchema,
    preserveKnownCoreType,
    validateConfigForCore
} from './core-validation.ts'
import { createVisualDraft, validateVisualSave } from './visual-draft.ts'

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

test('core schema loading rejects HTML fallbacks and error documents instead of passing validation', () => {
    for (const schema of [
        '<!doctype html><html></html>',
        undefined,
        null,
        [],
        {},
        { message: 'not found' }
    ]) {
        assert.equal(isUsableCoreSchema(schema), false)
    }
    assert.equal(
        isUsableCoreSchema({ type: 'object', properties: { inbounds: { type: 'array' } } }),
        true
    )
    assert.equal(isUsableCoreSchema({ $ref: '#/definitions/Config', definitions: {} }), true)
})

test('direct graphical entry parses the correct core and fails closed for missing core', () => {
    assert.equal(createVisualDraft(singboxConfig, 'singbox')?.document.coreType, 'singbox')
    assert.equal(createVisualDraft('{"inbounds":[]}', 'xray')?.document.coreType, 'xray')
    assert.equal(createVisualDraft(singboxConfig, undefined), null)
    assert.equal(createVisualDraft('invalid', 'singbox'), null)
    assert.equal(createVisualDraft('[]', 'xray'), null)
})

test('graphical Save validates exactly the draft being saved and preserves unknown fields/snippets', async () => {
    const value = JSON.stringify({
        ...JSON.parse(singboxConfig),
        custom: { keep: true },
        snippets: ['protected'],
        outbounds: [{ snippet: 'outbound-snippet' }]
    })
    const steps: string[] = []
    let saved: unknown
    assert.equal(
        await validateVisualSave(
            value,
            async (text) => {
                steps.push('validate')
                assert.equal(text, value)
                return true
            },
            async (config) => {
                steps.push('save')
                saved = config
            }
        ),
        true
    )
    assert.deepEqual(steps, ['validate', 'save'])
    assert.deepEqual(saved, JSON.parse(value))
})

test('invalid graphical drafts never reach the save API', async () => {
    let saves = 0
    const save = async () => {
        saves += 1
    }
    assert.equal(await validateVisualSave(singboxConfig, async () => false, save), false)
    assert.equal(await validateVisualSave('[]', async () => true, save), false)
    await assert.rejects(validateVisualSave('invalid', async () => true, save))
    assert.equal(saves, 0)
})

test('graphical Xray Save retains the Xray validator and refuses invalid configurations', async () => {
    let xrayCalls = 0
    let saves = 0
    const value = '{"inbounds":[],"outbounds":[{"protocol":"freedom","tag":"DIRECT"}]}'
    for (const error of [undefined, 'mock Xray rejection']) {
        const saved = await validateVisualSave(
            value,
            async (text) => {
                const result = await validateConfigForCore('xray', text, {
                    xrayWasm: () => {
                        xrayCalls += 1
                        return error
                    },
                    singboxSchema: () => {
                        throw new Error('Xray must not use sing-box schema')
                    }
                })
                return result.isValid
            },
            async () => {
                saves += 1
            }
        )
        assert.equal(saved, !error)
    }
    assert.equal(xrayCalls, 2)
    assert.equal(saves, 1)
})

test('missing core on graphical Save cannot invoke a validator or save', async () => {
    const unexpected = () => {
        throw new Error('must not be called')
    }
    assert.equal(
        await validateVisualSave(
            '{}',
            async (value) => {
                const result = await validateConfigForCore(undefined, value, {
                    xrayWasm: unexpected,
                    singboxSchema: unexpected
                })
                return result.isValid
            },
            async () => unexpected()
        ),
        false
    )
})

test('graphical Save propagates failure without mutating the draft', async () => {
    const draft = createVisualDraft(singboxConfig, 'singbox')!
    const before = JSON.stringify(draft.config)
    await assert.rejects(
        validateVisualSave(
            before,
            async () => true,
            async () => {
                throw new Error('mock save failed')
            }
        ),
        /mock save failed/
    )
    assert.equal(JSON.stringify(draft.config), before)
})

test('graphical sing-box Save never calls Xray and uses an isolated sing-box schema URI', async () => {
    let saves = 0
    let xrayCalls = 0
    await validateVisualSave(
        singboxConfig,
        async (value) => {
            const result = await validateConfigForCore('singbox', value, {
                xrayWasm: () => {
                    xrayCalls += 1
                    return undefined
                },
                singboxSchema: () => undefined
            })
            return result.isValid
        },
        async () => {
            saves += 1
        }
    )
    assert.equal(saves, 1)
    assert.equal(xrayCalls, 0)
    assert.equal(
        getConfigProfileModelUri('singbox', 'test-visual-save-1'),
        'singbox-config://test-visual-save-1.json'
    )
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
