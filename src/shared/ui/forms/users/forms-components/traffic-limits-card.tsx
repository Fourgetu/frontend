import { Alert, Select, Stack } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { ForwardRefComponent, HTMLMotionProps, Variants } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { PiClockDuotone } from 'react-icons/pi'
import { TbChartLine } from 'react-icons/tb'

import {
    CustomCreateUserRequest,
    CustomUpdateUserRequest,
    MONTH_CUSTOM_DAY
} from '@shared/api/types/user-traffic-reset.schema'
import { resetDataStrategy } from '@shared/constants/forms'
import { TrafficLimitInput } from '@shared/ui/forms/traffic-limit-input'
import {
    shouldShowLastDayFallbackHint,
    trafficResetDayOptions
} from '@shared/ui/forms/users/model/traffic-reset'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { SectionCard } from '@shared/ui/section-card'

interface IProps<T extends CustomCreateUserRequest | CustomUpdateUserRequest> {
    cardVariants: Variants
    form: UseFormReturnType<T>
    motionWrapper: ForwardRefComponent<HTMLDivElement, HTMLMotionProps<'div'>>
}

export const TrafficLimitsCard = <T extends CustomCreateUserRequest | CustomUpdateUserRequest>(
    props: IProps<T>
) => {
    const { t } = useTranslation()

    const { cardVariants, motionWrapper, form } = props

    const MotionWrapper = motionWrapper
    const isCustomReset = form.values.trafficLimitStrategy === MONTH_CUSTOM_DAY
    const resetDay = form.values.trafficLimitResetDay
    const strategyInputProps = form.getInputProps('trafficLimitStrategy')

    return (
        <MotionWrapper variants={cardVariants}>
            <SectionCard.Root>
                <SectionCard.Section>
                    <BaseOverlayHeader
                        iconColor="violet"
                        IconComponent={TbChartLine}
                        iconSize={20}
                        iconVariant="soft"
                        title={t('traffic-limits-card.traffic-and-limits')}
                        titleOrder={5}
                    />
                </SectionCard.Section>
                <SectionCard.Section>
                    <Stack gap="md">
                        <TrafficLimitInput
                            description={t('traffic-limits-card.traffic-limit-description')}
                            key={form.key('trafficLimitBytes')}
                            label={t('traffic-limits-card.traffic-limit')}
                            leftSection={<TbChartLine size={16} />}
                            {...form.getInputProps('trafficLimitBytes')}
                            styles={{
                                label: { fontWeight: 500 }
                            }}
                        />

                        <Select
                            allowDeselect={false}
                            comboboxProps={{
                                transitionProps: { transition: 'fade', duration: 200 }
                            }}
                            data={resetDataStrategy(t)}
                            defaultValue={form.values.trafficLimitStrategy}
                            description={t(
                                'create-user-modal.widget.traffic-reset-strategy-description'
                            )}
                            key={form.key('trafficLimitStrategy')}
                            label={t('create-user-modal.widget.traffic-reset-strategy')}
                            leftSection={<PiClockDuotone size="16px" />}
                            placeholder={t('create-user-modal.widget.pick-value')}
                            {...strategyInputProps}
                            onChange={(value) => {
                                strategyInputProps.onChange(value)
                                if (value !== MONTH_CUSTOM_DAY) {
                                    form.setFieldValue('trafficLimitResetDay', null as never)
                                }
                            }}
                            styles={{
                                label: { fontWeight: 500 }
                            }}
                        />

                        {isCustomReset && (
                            <Select
                                allowDeselect={false}
                                data={trafficResetDayOptions.map((day) => ({
                                    value: String(day),
                                    label: t('traffic-limits-card.reset-day-option', { day })
                                }))}
                                description={t('traffic-limits-card.custom-reset-day-description')}
                                key={form.key('trafficLimitResetDay')}
                                label={t('traffic-limits-card.custom-reset-day')}
                                onChange={(value) =>
                                    form.setFieldValue(
                                        'trafficLimitResetDay',
                                        (value === null ? null : Number(value)) as never
                                    )
                                }
                                required
                                value={resetDay == null ? null : String(resetDay)}
                            />
                        )}

                        {isCustomReset && shouldShowLastDayFallbackHint(resetDay) && (
                            <Alert color="blue" variant="light">
                                {t('traffic-limits-card.last-day-fallback-hint')}
                            </Alert>
                        )}
                    </Stack>
                </SectionCard.Section>
            </SectionCard.Root>
        </MotionWrapper>
    )
}
