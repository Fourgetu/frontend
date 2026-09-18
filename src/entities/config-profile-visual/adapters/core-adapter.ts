import type { JsonObject, VisualCoreType, VisualDocument, VisualPatch } from '../types.ts'

export interface CoreVisualAdapter {
    readonly coreType: VisualCoreType
    parse(rawConfig: JsonObject): VisualDocument
    applyPatch(rawConfig: JsonObject, patch: VisualPatch): JsonObject
}
