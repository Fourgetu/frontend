import type { ConcurrentProfileBindings } from '@features/dashboard/nodes/config-profile-selection/model/concurrent-profile-selection'

import { ShowConfigProfilesWithInboundsFeature } from '@features/ui/dashboard/nodes/show-config-profiles-with-inbounds'
import { Button, Group, Skeleton, Stack } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { useTranslation } from 'react-i18next'
import { PiArrowLeft } from 'react-icons/pi'
import { SiSecurityscorecard } from 'react-icons/si'
import { TbCheck } from 'react-icons/tb'

import { useGetConfigProfiles } from '@shared/api/hooks'
import type { ConcurrentCreateNodeRequestBody } from '@shared/api/types/concurrent-node.schema'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { SectionCard } from '@shared/ui/section-card'

import { CopyDockerComposeWidget } from './copy-docker-compose.widget'

interface IProps {
    // oxlint-disable-next-line
    form: UseFormReturnType<ConcurrentCreateNodeRequestBody, any>
    isCreating: boolean
    onCreateNode: () => void
    onPrev: () => void
    port: number
}

export const CreateNodeStep2ConfigProfiles = ({
    form,
    isCreating,
    onCreateNode,
    onPrev,
    port
}: IProps) => {
    const { t } = useTranslation()

    const { data: configProfiles, isLoading: isConfigProfilesLoading } = useGetConfigProfiles()

    const saveInbounds = (bindings: ConcurrentProfileBindings) => {
        form.setValues(bindings)
        form.setTouched({ configProfile: true, singBoxConfigProfile: true })
        form.setDirty({ configProfile: true, singBoxConfigProfile: true })
    }

    const handleCreateNode = () => {
        const validation = form.validate()

        if (!validation.hasErrors) {
            onCreateNode()
        }
    }

    return (
        <Stack gap="xl" mih={400}>
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
                        <ShowConfigProfilesWithInboundsFeature
                            activeConfigProfiles={{
                                configProfile: form.getValues().configProfile ?? null,
                                singBoxConfigProfile: form.getValues().singBoxConfigProfile ?? null
                            }}
                            configProfiles={configProfiles.configProfiles}
                            errors={form.errors.configProfile ?? form.errors.singBoxConfigProfile}
                            onSaveInbounds={saveInbounds}
                        />
                    )}
                </SectionCard.Section>
            </SectionCard.Root>

            <Stack gap="xs" mt="auto">
                <CopyDockerComposeWidget port={port} />

                <Group justify="space-between">
                    <Button
                        color="gray"
                        leftSection={<PiArrowLeft size={18} />}
                        onClick={onPrev}
                        size="md"
                    >
                        {t('create-node-modal.widget.back')}
                    </Button>
                    <Button
                        color="teal"
                        leftSection={<TbCheck size={18} />}
                        loading={isCreating}
                        onClick={handleCreateNode}
                        size="md"
                        type="submit"
                    >
                        {t('create-node-modal.widget.create-node')}
                    </Button>
                </Group>
            </Stack>
        </Stack>
    )
}
