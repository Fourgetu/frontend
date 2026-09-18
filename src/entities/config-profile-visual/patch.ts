import type { JsonObject, JsonPath, VisualPatch } from './types.ts'

import { isSnippetManagedPath } from './references.ts'

const isObject = (value: unknown): value is JsonObject =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const getContainer = (
    root: unknown,
    path: JsonPath
): { parent: JsonObject | unknown[]; key: string | number } => {
    if (path.length === 0) throw new Error('A visual patch operation requires a non-empty path.')
    let current: unknown = root
    for (const segment of path.slice(0, -1)) {
        if (Array.isArray(current) && typeof segment === 'number') current = current[segment]
        else if (isObject(current) && typeof segment === 'string') current = current[segment]
        else throw new Error(`Cannot resolve visual patch path: ${path.join('.')}`)
    }
    if (!Array.isArray(current) && !isObject(current)) {
        throw new Error(`Cannot resolve visual patch container: ${path.join('.')}`)
    }
    return { parent: current, key: path[path.length - 1] }
}

export const applyVisualPatch = (rawConfig: JsonObject, patch: VisualPatch): JsonObject => {
    const next = cloneJson(rawConfig)
    for (const operation of patch.operations) {
        if (isSnippetManagedPath(rawConfig, operation.path)) {
            throw new Error('Snippet-managed configuration is read-only in Visual mode.')
        }
        const { parent, key } = getContainer(next, operation.path)
        if (operation.op === 'set') {
            if (Array.isArray(parent) && typeof key === 'number')
                parent[key] = cloneJson(operation.value)
            else if (isObject(parent) && typeof key === 'string')
                parent[key] = cloneJson(operation.value)
            else throw new Error(`Invalid visual patch target: ${operation.path.join('.')}`)
        } else if (Array.isArray(parent) && typeof key === 'number') {
            parent.splice(key, 1)
        } else if (isObject(parent) && typeof key === 'string') {
            delete parent[key]
        } else throw new Error(`Invalid visual patch target: ${operation.path.join('.')}`)
    }
    return next
}

export const setVisualPath = (path: JsonPath, value: unknown): VisualPatch => ({
    operations: [{ op: 'set', path, value }]
})
