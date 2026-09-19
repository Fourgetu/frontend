import { CreateNodeCommand, NodesSchema, UpdateNodeCommand } from '@remnawave/backend-contract'
import { z } from 'zod'

export const NodeProfileBindingSchema = z.object({
    activeConfigProfileUuid: z.string().uuid(),
    activeInbounds: z.array(z.string().uuid())
})

const atLeastOneCoreProfile = (
    value: {
        configProfile?: null | z.infer<typeof NodeProfileBindingSchema>
        singBoxConfigProfile?: null | z.infer<typeof NodeProfileBindingSchema>
    },
    context: z.RefinementCtx
) => {
    if (!value.configProfile && !value.singBoxConfigProfile) {
        context.addIssue({
            code: 'custom',
            message: 'Select at least one Xray or sing-box Config Profile.',
            path: ['configProfile']
        })
    }
}

export const ConcurrentCreateNodeRequestBodySchema = CreateNodeCommand.RequestBodySchema.omit({
    configProfile: true
})
    .extend({
        configProfile: NodeProfileBindingSchema.nullable().optional(),
        singBoxConfigProfile: NodeProfileBindingSchema.nullable().optional()
    })
    .superRefine(atLeastOneCoreProfile)

export const ConcurrentUpdateNodeRequestBodySchema = UpdateNodeCommand.RequestBodySchema.omit({
    configProfile: true
}).extend({
    configProfile: NodeProfileBindingSchema.nullable().optional(),
    singBoxConfigProfile: NodeProfileBindingSchema.nullable().optional()
})

export const ConcurrentNodeSchema = NodesSchema.extend({
    configProfile: NodesSchema.shape.configProfile.extend({
        activeSingBoxConfigProfileUuid: z.string().uuid().nullable()
    }),
    versions: z
        .object({
            xray: z.string(),
            singbox: z.string().optional(),
            gost: z.string().optional(),
            node: z.string()
        })
        .nullable(),
    runtimeHealth: z
        .object({
            observedAt: z.string(),
            xray: z.object({
                status: z.enum(['running', 'stopped', 'unavailable', 'unknown']),
                version: z.string().nullable()
            }),
            singbox: z.object({
                status: z.enum(['running', 'stopped', 'unavailable', 'unknown']),
                version: z.string().nullable()
            }),
            gost: z.object({
                status: z.enum(['running', 'stopped', 'unavailable', 'unknown']),
                version: z.string().nullable(),
                installed: z.boolean().nullable(),
                services: z.number().nullable()
            })
        })
        .nullable()
})

export const ConcurrentNodesResponseSchema = z.object({ response: z.array(ConcurrentNodeSchema) })
export const ConcurrentNodeResponseSchema = z.object({ response: ConcurrentNodeSchema })

export type ConcurrentCreateNodeRequestBody = z.infer<typeof ConcurrentCreateNodeRequestBodySchema>
export type ConcurrentUpdateNodeRequestBody = z.infer<typeof ConcurrentUpdateNodeRequestBodySchema>
export type ConcurrentNodeFormValues =
    | ConcurrentCreateNodeRequestBody
    | ConcurrentUpdateNodeRequestBody
export type NodeProfileBinding = z.infer<typeof NodeProfileBindingSchema>
