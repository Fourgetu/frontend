import type { ConcurrentUpdateNodeRequestBody } from '../../../../../shared/api/types/concurrent-node.schema'

export const getChangedNodeValues = (
    uuid: string,
    values: ConcurrentUpdateNodeRequestBody,
    isDirty: (field: string) => boolean
): ConcurrentUpdateNodeRequestBody => ({
    ...Object.fromEntries(
        Object.entries(values).filter(([field, value]) => value !== undefined && isDirty(field))
    ),
    uuid
})
