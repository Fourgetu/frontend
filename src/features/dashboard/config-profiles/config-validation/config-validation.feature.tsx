import type { editor } from 'monaco-editor'

import { GetSnippetsCommand } from '@remnawave/backend-contract'
import consola from 'consola/browser'
import dayjs from 'dayjs'
import { getWorker } from 'monaco-editor/languages/features/json/register'
import { RefObject } from 'react'

import { type ConfigProfileCoreType, validateConfigForCore } from './core-validation.ts'

const PROTECTED_ROOT_KEYS = new Set(['api', 'inbounds', 'metrics', 'snippets', 'stats'])

const replaceSnippetsInRoot = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: any,
    snippetsMap: Map<string, unknown>
): void => {
    const names = config.snippets

    delete config.snippets

    if (!Array.isArray(names)) return

    const merged: Record<string, unknown> = {}

    for (const name of names) {
        const snippet = snippetsMap.get(name)

        if (!snippet) {
            consola.error(`Snippet ${name} not found`)
            continue
        }

        for (const part of Array.isArray(snippet) ? snippet : [snippet]) {
            if (!part || typeof part !== 'object' || Array.isArray(part)) continue

            Object.assign(merged, part)
        }
    }

    for (const [key, value] of Object.entries(merged)) {
        if (PROTECTED_ROOT_KEYS.has(key) || key in config) continue

        config[key] = value
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const replaceSnippetsInArray = (array: any[], snippetsMap: Map<string, unknown>): void => {
    for (let i = array.length - 1; i >= 0; i--) {
        const item = array[i]

        if (item.snippet) {
            const snippet = snippetsMap.get(item.snippet)

            if (snippet) {
                if (Array.isArray(snippet)) {
                    array.splice(i, 1, ...snippet)
                } else {
                    // eslint-disable-next-line no-param-reassign
                    array[i] = snippet
                }
            } else {
                consola.error(`Snippet ${item.snippet} not found`)
                array.splice(i, 1)
            }
        }
    }
}

interface JsonSchemaDiagnostic {
    message: string
    range: {
        start: {
            line: number
        }
    }
    severity?: number
}

interface JsonValidationWorker {
    doValidation: (uri: string) => Promise<JsonSchemaDiagnostic[]>
}

const validateWithSingboxSchema = async (
    editorInstance: editor.IStandaloneCodeEditor
): Promise<string | undefined> => {
    const model = editorInstance.getModel()
    if (!model || model.uri.scheme !== 'singbox-config') {
        return 'sing-box schema validation is unavailable for the current editor model.'
    }

    const workerAccessor = await getWorker()
    const worker = (await workerAccessor(model.uri)) as unknown as JsonValidationWorker
    const diagnostics = await worker.doValidation(model.uri.toString())
    const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 1)

    if (errors.length === 0) return undefined

    return errors
        .slice(0, 3)
        .map((diagnostic) => `Line ${diagnostic.range.start.line + 1}: ${diagnostic.message}`)
        .join(' | ')
}

const validationRuns = new WeakMap<editor.IStandaloneCodeEditor, number>()

export const ConfigValidationFeature = {
    validate: async (
        editorRef: RefObject<editor.IStandaloneCodeEditor | null>,

        setResult: (message: string) => void,
        setIsConfigValid: (isValid: boolean) => void,
        snippetsMap: Map<
            string,
            GetSnippetsCommand.Response['response']['snippets'][number]['snippet']
        >,
        coreType: ConfigProfileCoreType | undefined
    ) => {
        try {
            if (!editorRef.current) return

            const editorInstance = editorRef.current
            const run = (validationRuns.get(editorInstance) ?? 0) + 1
            validationRuns.set(editorInstance, run)

            if (!coreType) {
                const validation = await validateConfigForCore(undefined, '', {
                    singboxSchema: () => undefined,
                    xrayWasm: () => undefined
                })
                if (validationRuns.get(editorInstance) !== run) return
                setResult(`${dayjs().format('HH:mm:ss')} | ${validation.message}`)
                setIsConfigValid(false)
                return
            }

            const currentValue = editorInstance.getValue()

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let clonedCurrentValue: any
            try {
                clonedCurrentValue = JSON.parse(currentValue)
            } catch {
                setResult(`${dayjs().format('HH:mm:ss')} | Invalid JSON.`)
                setIsConfigValid(false)
                return
            }

            replaceSnippetsInRoot(clonedCurrentValue, snippetsMap)

            if (clonedCurrentValue.outbounds) {
                replaceSnippetsInArray(clonedCurrentValue.outbounds, snippetsMap)
            }

            if (clonedCurrentValue.routing?.rules) {
                replaceSnippetsInArray(clonedCurrentValue.routing.rules, snippetsMap)
            }

            if (clonedCurrentValue.routing?.balancers) {
                replaceSnippetsInArray(clonedCurrentValue.routing.balancers, snippetsMap)
            }

            if (clonedCurrentValue.route?.rules) {
                replaceSnippetsInArray(clonedCurrentValue.route.rules, snippetsMap)
            }

            if (clonedCurrentValue.route?.rule_set) {
                replaceSnippetsInArray(clonedCurrentValue.route.rule_set, snippetsMap)
            }

            const validation = await validateConfigForCore(
                coreType,
                JSON.stringify(clonedCurrentValue),
                {
                    singboxSchema: () => validateWithSingboxSchema(editorInstance),
                    xrayWasm: (config) => window.XrayParseConfig(config) || undefined
                }
            )

            if (validationRuns.get(editorInstance) !== run) return

            setResult(`${dayjs().format('HH:mm:ss')} | ${validation.message}`)
            setIsConfigValid(validation.isValid)
        } catch (err: unknown) {
            const message = (err as Error).message
            if (message?.includes('Go program has already exited')) {
                setResult(`${dayjs().format('HH:mm:ss')} | WASM module crashed, restarting...`)
            } else {
                setResult(`${dayjs().format('HH:mm:ss')} | Validation error: ${message}`)
            }
            setIsConfigValid(false)
        }
    }
}
