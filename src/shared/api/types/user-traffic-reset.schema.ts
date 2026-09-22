import {
    BulkAllUpdateUsersCommand,
    BulkUpdateUsersCommand,
    CreateUserCommand,
    GetUserByIdCommand,
    GetUsersCommand,
    RESET_PERIODS,
    UpdateUserCommand
} from '@remnawave/backend-contract'
import { z } from 'zod'

export const MONTH_CUSTOM_DAY = 'MONTH_CUSTOM_DAY' as const
export const USER_RESET_PERIODS = {
    ...RESET_PERIODS,
    MONTH_CUSTOM_DAY
} as const

export const userResetStrategySchema = z.enum(USER_RESET_PERIODS)
export const userResetDaySchema = z.number().int().min(1).max(31).nullable()

export const validateCustomResetDay = (
    data: { trafficLimitStrategy?: string; trafficLimitResetDay?: number | null },
    ctx: z.RefinementCtx
) => {
    if (data.trafficLimitStrategy === MONTH_CUSTOM_DAY && data.trafficLimitResetDay == null) {
        ctx.addIssue({
            code: 'custom',
            path: ['trafficLimitResetDay'],
            message: 'Traffic reset day is required'
        })
    }
}

export const customUserSchema = GetUserByIdCommand.ResponseSchema.shape.response.extend({
    trafficLimitStrategy: userResetStrategySchema,
    trafficLimitResetDay: userResetDaySchema
})

export const customUserResponseSchema = GetUserByIdCommand.ResponseSchema.extend({
    response: customUserSchema
})

export const customUsersResponseSchema = GetUsersCommand.ResponseSchema.extend({
    response: GetUsersCommand.ResponseSchema.shape.response.extend({
        users: z.array(customUserSchema)
    })
})

export const customCreateUserRequestSchema = CreateUserCommand.RequestBodySchema.extend({
    trafficLimitStrategy: userResetStrategySchema.default(RESET_PERIODS.NO_RESET).optional(),
    trafficLimitResetDay: userResetDaySchema.optional()
}).superRefine(validateCustomResetDay)

export const customCreateUserFormSchema = z
    .object(customCreateUserRequestSchema.shape)
    .omit({
        expireAt: true,
        hwidDeviceLimit: true
    })
    .superRefine(validateCustomResetDay)

export const customUpdateUserRequestSchema = z
    .object({
        ...UpdateUserCommand.RequestBodySchema.shape,
        trafficLimitStrategy: userResetStrategySchema.optional(),
        trafficLimitResetDay: userResetDaySchema.optional()
    })
    .refine((data) => data.username ?? data.id, {
        error: 'At least one of username, id must be provided'
    })
    .superRefine(validateCustomResetDay)

export const customBulkUpdateUsersRequestSchema = BulkUpdateUsersCommand.RequestBodySchema.extend({
    fields: BulkUpdateUsersCommand.RequestBodySchema.shape.fields.extend({
        trafficLimitStrategy: userResetStrategySchema.optional(),
        trafficLimitResetDay: userResetDaySchema.optional()
    })
})

export const customBulkAllUpdateUsersRequestSchema =
    BulkAllUpdateUsersCommand.RequestBodySchema.extend({
        trafficLimitStrategy: userResetStrategySchema.optional(),
        trafficLimitResetDay: userResetDaySchema.optional()
    })

export type CustomUser = z.infer<typeof customUserSchema>
export type CustomCreateUserRequest = z.infer<typeof customCreateUserRequestSchema>
export type CustomUpdateUserRequest = z.infer<typeof customUpdateUserRequestSchema>
export type CustomBulkUpdateUsersRequest = z.infer<typeof customBulkUpdateUsersRequestSchema>
export type CustomBulkAllUpdateUsersRequest = z.infer<typeof customBulkAllUpdateUsersRequestSchema>
