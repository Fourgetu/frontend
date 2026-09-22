import { MONTH_CUSTOM_DAY } from '../../../../api/types/user-traffic-reset.schema.ts'

export const trafficResetDayOptions = Array.from({ length: 31 }, (_, index) => index + 1)

export const isCustomMonthlyReset = (strategy: string | undefined): boolean =>
    strategy === MONTH_CUSTOM_DAY

export const shouldShowLastDayFallbackHint = (day: number | null | undefined): boolean =>
    day !== null && day !== undefined && day >= 29

export const normalizeTrafficResetDay = (
    strategy: string | undefined,
    day: number | null | undefined
): number | null => (isCustomMonthlyReset(strategy) ? (day ?? null) : null)

export const formatTrafficResetStrategy = (
    strategyLabel: string,
    strategy: string,
    day: number | null
): string =>
    isCustomMonthlyReset(strategy) && day !== null ? `${strategyLabel} · ${day}` : strategyLabel
