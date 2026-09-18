import { ConfigProfileSchema } from '@remnawave/backend-contract'
import { z } from 'zod'

export const ConfigProfileCoreTypeSchema = z.enum(['xray', 'singbox'])

export const ConfigProfileWithOptionalCoreTypeSchema = ConfigProfileSchema.extend({
    coreType: ConfigProfileCoreTypeSchema.optional()
})

export const ConfigProfileWithCoreTypeSchema = ConfigProfileSchema.extend({
    coreType: ConfigProfileCoreTypeSchema
})

export const ConfigProfileResponseWithOptionalCoreTypeSchema = z.object({
    response: ConfigProfileWithOptionalCoreTypeSchema
})

export const ConfigProfileResponseWithCoreTypeSchema = z.object({
    response: ConfigProfileWithCoreTypeSchema
})

export const ConfigProfilesResponseWithCoreTypeSchema = z.object({
    response: z.object({ configProfiles: z.array(ConfigProfileWithCoreTypeSchema) })
})
