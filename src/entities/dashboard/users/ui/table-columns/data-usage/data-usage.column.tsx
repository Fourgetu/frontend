import { Box, Group, Progress, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'

import { USER_RESET_PERIODS } from '@shared/api/types/user-traffic-reset.schema'
import { prettifyBytesUtil } from '@shared/utils/bytes'

import { IProps } from '@entities/dashboard/users/ui/table-columns/username/interface'

export function DataUsageColumnEntity(props: IProps) {
    const { t } = useTranslation()

    const { user } = props

    const usedBytes = user.userTraffic.usedTrafficBytes
    const limitBytes = user.trafficLimitBytes
    const lifetimeBytes = user.userTraffic.lifetimeUsedTrafficBytes
    const isUnlimited = limitBytes === 0
    const percentage = isUnlimited ? 0 : (usedBytes * 100) / limitBytes

    const strategy = {
        [USER_RESET_PERIODS.MONTH]: t('data-usage.column.monthly'),
        [USER_RESET_PERIODS.WEEK]: t('data-usage.column.weekly'),
        [USER_RESET_PERIODS.DAY]: t('data-usage.column.daily'),
        [USER_RESET_PERIODS.MONTH_ROLLING]: `${t('data-usage.column.monthly')} ↻`,
        [USER_RESET_PERIODS.MONTH_CUSTOM_DAY]: t('data-usage.column.monthly-custom-day', {
            day: user.trafficLimitResetDay
        }),
        [USER_RESET_PERIODS.NO_RESET]: '∞'
    }[user.trafficLimitStrategy]

    const prettyUsedData = prettifyBytesUtil(usedBytes) || '0 B'
    const prettyLifetimeData = prettifyBytesUtil(lifetimeBytes) || '0 B'
    const maxData = isUnlimited ? '∞' : prettifyBytesUtil(limitBytes) || '∞'

    const getProgressColor = () => {
        if (isUnlimited) return 'teal'
        if (percentage > 95) return 'red'
        if (percentage > 80) return 'yellow.4'
        return 'teal'
    }

    return (
        <Box miw={300}>
            <Group justify="space-between">
                <Text c="red.5" fw={700} fz="xs">
                    {percentage.toFixed(2)}%
                    <Text c="dimmed" component="span" fz="xs">
                        {' '}
                        {strategy}
                    </Text>
                </Text>
                <Text c="teal.5" fw={700} fz="xs">
                    <Text c="dimmed" component="span" fw={550} fz="xs" size="xs">
                        Σ {prettyLifetimeData}
                    </Text>{' '}
                    {(100 - percentage).toFixed(2)}%
                </Text>
            </Group>
            <Progress
                color={getProgressColor()}
                radius="xs"
                size="md"
                value={isUnlimited ? 100 : percentage}
            />

            <Group gap="xs" justify="space-between" mt={2}>
                <Text c="dimmed" fw={550} size="xs">
                    {prettyUsedData}
                </Text>

                <Text c="dimmed" fw={550} size="xs">
                    {maxData}
                </Text>
            </Group>
        </Box>
    )
}
