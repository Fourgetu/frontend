import type { ConcurrentProfileBindings } from '@features/dashboard/nodes/config-profile-selection/model/concurrent-profile-selection'

import { ShowConfigProfilesWithInboundsFeature } from '@features/ui/dashboard/nodes/show-config-profiles-with-inbounds'
import { Skeleton, Stack } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { ForwardRefComponent, HTMLMotionProps, motion, Variants } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { SiSecurityscorecard } from 'react-icons/si'

import { useGetConfigProfiles } from '@shared/api/hooks'
import type { ConcurrentNodeFormValues } from '@shared/api/types/concurrent-node.schema'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { SectionCard } from '@shared/ui/section-card'

interface IProps<T extends ConcurrentNodeFormValues> {
    cardVariants: Variants
    form: UseFormReturnType<T>
    motionWrapper: ForwardRefComponent<HTMLDivElement, HTMLMotionProps<'div'>>
}

export const NodeConfigProfilesCard = <T extends ConcurrentNodeFormValues>(props: IProps<T>) => {
    const { t } = useTranslation()
    const { cardVariants, form, motionWrapper } = props

    const MotionWrapper = motionWrapper

    const { data: configProfiles, isLoading: isConfigProfilesLoading } = useGetConfigProfiles()

    const saveInbounds = (bindings: ConcurrentProfileBindings) => {
        form.setValues(bindings as Partial<T>)
        form.setTouched({ configProfile: true, singBoxConfigProfile: true } as never)
        form.setDirty({ configProfile: true, singBoxConfigProfile: true } as never)
    }

    return (
        <MotionWrapper variants={cardVariants}>
            <SectionCard.Root>
                <SectionCard.Section>
                    <BaseOverlayHeader
                        iconColor="teal"
                        IconComponent={SiSecurityscorecard}
                        iconVariant="soft"
                        title={t('base-node-form.core-configuration')}
                        titleOrder={5}
                    />
                </SectionCard.Section>
                <SectionCard.Section>
                    {isConfigProfilesLoading && (
                        <Stack gap="md">
                            <Skeleton height={24} width="40%" />
                            <Skeleton height={16} width="60%" />
                            <Skeleton height={76} radius="md" />
                            <Skeleton height={25} radius="sm" width="100%" />
                        </Stack>
                    )}

                    {!isConfigProfilesLoading && configProfiles && (
                        <motion.div
                            animate={{ opacity: 1 }}
                            initial={{ opacity: 0 }}
                            transition={{
                                duration: 0.4,
                                ease: 'easeInOut'
                            }}
                        >
                            <ShowConfigProfilesWithInboundsFeature
                                activeConfigProfiles={{
                                    configProfile: form.getValues().configProfile ?? null,
                                    singBoxConfigProfile:
                                        form.getValues().singBoxConfigProfile ?? null
                                }}
                                configProfiles={configProfiles.configProfiles}
                                errors={
                                    form.errors.configProfile ?? form.errors.singBoxConfigProfile
                                }
                                onSaveInbounds={saveInbounds}
                            />
                        </motion.div>
                    )}
                </SectionCard.Section>
            </SectionCard.Root>
        </MotionWrapper>
    )
}
