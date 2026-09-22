import { TFunction } from 'i18next'

import { USER_RESET_PERIODS } from '@shared/api/types/user-traffic-reset.schema'

export const resetDataStrategy = (t: TFunction) => [
    { value: USER_RESET_PERIODS.NO_RESET, label: t('reset-data.constants.never-reset') },
    { value: USER_RESET_PERIODS.DAY, label: t('reset-data.constants.reset-daily') },
    { value: USER_RESET_PERIODS.WEEK, label: t('reset-data.constants.reset-weekly') },
    { value: USER_RESET_PERIODS.MONTH, label: t('reset-data.constants.reset-monthly') },
    {
        value: USER_RESET_PERIODS.MONTH_ROLLING,
        label: t('reset-data.constants.reset-monthly-by-creation-date')
    },
    {
        value: USER_RESET_PERIODS.MONTH_CUSTOM_DAY,
        label: t('reset-data.constants.reset-monthly-by-custom-day')
    }
]
