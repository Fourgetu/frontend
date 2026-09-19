import type {
    JsonObject,
    VisualDocument
} from '../../../../entities/config-profile-visual/types.ts'

import { parseConfigProfile } from '../../../../entities/config-profile-visual/parse.ts'
import { isConfigProfileCoreType } from './core-validation.ts'

export function createVisualDraft(
    value: string,
    coreType: unknown
): { config: JsonObject; document: VisualDocument } | null {
    if (!isConfigProfileCoreType(coreType)) return null
    try {
        const config: unknown = JSON.parse(value)
        if (!config || typeof config !== 'object' || Array.isArray(config)) return null
        return {
            config: config as JsonObject,
            document: parseConfigProfile(config as JsonObject, coreType)
        }
    } catch {
        return null
    }
}

export async function validateVisualSave(
    value: string,
    validate: (value: string) => Promise<boolean>,
    save: (config: JsonObject) => Promise<unknown>
): Promise<boolean> {
    // Capture and validate exactly the same draft that will be persisted.
    const config: unknown = JSON.parse(value)
    if (!config || typeof config !== 'object' || Array.isArray(config)) return false
    if (!(await validate(value))) return false
    await save(config as JsonObject)
    return true
}
