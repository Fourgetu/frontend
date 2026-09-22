import assert from 'node:assert/strict'
import test from 'node:test'

import {
    customCreateUserFormSchema,
    customCreateUserRequestSchema,
    customUpdateUserRequestSchema,
    MONTH_CUSTOM_DAY,
    USER_RESET_PERIODS
} from '../../../../api/types/user-traffic-reset.schema.ts'
import {
    isCustomMonthlyReset,
    normalizeTrafficResetDay,
    shouldShowLastDayFallbackHint,
    trafficResetDayOptions
} from './traffic-reset.ts'

test('custom monthly strategy is selectable and shows its day selector', () => {
    assert.equal(USER_RESET_PERIODS.MONTH_CUSTOM_DAY, MONTH_CUSTOM_DAY)
    assert.equal(isCustomMonthlyReset(MONTH_CUSTOM_DAY), true)
    assert.equal(isCustomMonthlyReset('MONTH'), false)
})

test('create payload requires and preserves a custom reset day', () => {
    const valid = customCreateUserRequestSchema.parse({
        username: 'custom-reset-user',
        expireAt: '2027-09-22T00:00:00.000Z',
        trafficLimitStrategy: MONTH_CUSTOM_DAY,
        trafficLimitResetDay: 15
    })
    assert.equal(valid.trafficLimitResetDay, 15)

    assert.equal(
        customCreateUserRequestSchema.safeParse({
            username: 'custom-reset-user',
            expireAt: '2027-09-22T00:00:00.000Z',
            trafficLimitStrategy: MONTH_CUSTOM_DAY
        }).success,
        false
    )
})

test('create-user form schema can omit non-form fields without inheriting refinements', () => {
    assert.doesNotThrow(() => customCreateUserFormSchema.parse({ username: 'plain-user' }))

    assert.equal(
        customCreateUserFormSchema.safeParse({
            username: 'custom-reset-user',
            trafficLimitStrategy: MONTH_CUSTOM_DAY
        }).success,
        false
    )
})

test('edit payload preserves the prefilled custom strategy and day', () => {
    const payload = customUpdateUserRequestSchema.parse({
        id: 6,
        trafficLimitStrategy: MONTH_CUSTOM_DAY,
        trafficLimitResetDay: 31
    })
    assert.equal(payload.trafficLimitStrategy, MONTH_CUSTOM_DAY)
    assert.equal(payload.trafficLimitResetDay, 31)
})

test('all reset days from 1 through 31 are available', () => {
    assert.equal(trafficResetDayOptions.length, 31)
    assert.deepEqual(
        trafficResetDayOptions,
        Array.from({ length: 31 }, (_, index) => index + 1)
    )
})

test('leaving custom monthly strategy clears the reset day payload', () => {
    assert.equal(normalizeTrafficResetDay(MONTH_CUSTOM_DAY, 15), 15)
    assert.equal(normalizeTrafficResetDay('NO_RESET', 15), null)
})

test('month-end fallback hint is shown only for days 29 through 31', () => {
    assert.equal(shouldShowLastDayFallbackHint(28), false)
    assert.equal(shouldShowLastDayFallbackHint(29), true)
    assert.equal(shouldShowLastDayFallbackHint(30), true)
    assert.equal(shouldShowLastDayFallbackHint(31), true)
})
