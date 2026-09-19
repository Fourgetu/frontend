import { ActionIcon, Badge, Button, Group, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { TbEdit, TbFilePlus, TbTag } from 'react-icons/tb'

import { showModal } from '@shared/_modals/show-modal'
import { XrayLogo } from '@shared/ui/logos'
import { SectionCard } from '@shared/ui/section-card'

import { IProps } from './interfaces'

export function ShowConfigProfilesWithInboundsFeature(props: IProps) {
    const { activeConfigProfiles, configProfiles, onSaveInbounds, errors } = props
    const { t } = useTranslation()

    const activeProfiles = useMemo(
        () =>
            (
                [
                    ['xray', activeConfigProfiles.configProfile],
                    ['singbox', activeConfigProfiles.singBoxConfigProfile]
                ] as const
            ).flatMap(([coreType, binding]) => {
                if (!binding) return []

                const profile = configProfiles.find(
                    (candidate) => candidate.uuid === binding.activeConfigProfileUuid
                )
                if (!profile) return []

                const ports = binding.activeInbounds
                    .map((inboundUuid) =>
                        profile.inbounds.find((inbound) => inbound.uuid === inboundUuid)
                    )
                    .map((inbound) => inbound?.port ?? null)
                    .filter((port): port is number => port !== null)

                return [
                    {
                        binding,
                        coreType,
                        ports: [...new Set(ports)],
                        profile
                    }
                ]
            }),
        [activeConfigProfiles, configProfiles]
    )

    const hasError = Boolean(errors)
    const openProfileDrawer = () =>
        showModal('nodes_nodesConfigProfilesDrawer', {
            activeConfigProfiles,
            onSaveInbounds
        })

    return (
        <SectionCard.Root
            style={hasError ? { borderColor: 'var(--mantine-color-red-5)' } : undefined}
        >
            {activeProfiles.length > 0 ? (
                activeProfiles.map(({ binding, coreType, ports, profile }) => (
                    <SectionCard.Section key={coreType}>
                        <Stack gap="sm">
                            <Group gap="sm" justify="space-between" wrap="nowrap">
                                <Group gap="sm" style={{ flex: 1, minWidth: 0 }} wrap="nowrap">
                                    <ThemeIcon
                                        color={coreType === 'singbox' ? 'violet' : 'cyan'}
                                        size="lg"
                                        variant="soft"
                                    >
                                        <XrayLogo size={20} />
                                    </ThemeIcon>
                                    <Stack gap={2} style={{ minWidth: 0 }}>
                                        <Text ff="monospace" fw={600} size="sm" truncate>
                                            {profile.name}
                                        </Text>
                                        <Text c="dimmed" size="xs">
                                            {coreType === 'singbox' ? 'sing-box' : 'Xray'}
                                        </Text>
                                    </Stack>
                                </Group>

                                <Group gap="xs" style={{ flexShrink: 0 }} wrap="nowrap">
                                    <Badge
                                        color={coreType === 'singbox' ? 'violet' : 'cyan'}
                                        leftSection={<TbTag size={12} />}
                                        size="lg"
                                        variant="light"
                                    >
                                        {binding.activeInbounds.length}
                                    </Badge>

                                    <Tooltip label={t('common.action.edit')}>
                                        <ActionIcon
                                            onClick={openProfileDrawer}
                                            size="lg"
                                            variant="default"
                                        >
                                            <TbEdit size={18} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Group>
                            </Group>

                            {ports.length > 0 && (
                                <Group gap={4}>
                                    {ports.map((port, index) => (
                                        <Badge
                                            color="gray"
                                            key={`${port}-${index}`}
                                            radius="sm"
                                            size="sm"
                                            variant="default"
                                        >
                                            {port}
                                        </Badge>
                                    ))}
                                </Group>
                            )}
                        </Stack>
                    </SectionCard.Section>
                ))
            ) : (
                <>
                    <SectionCard.Section>
                        <Group gap="sm" wrap="nowrap">
                            <ThemeIcon color="gray" size="lg" variant="default">
                                <XrayLogo size={20} />
                            </ThemeIcon>
                            <Stack gap={2}>
                                <Text fw={500} size="sm">
                                    {t(
                                        'show-config-profiles-with-inbounds.feature.no-config-profile-selected'
                                    )}
                                </Text>
                                <Text c="dimmed" size="xs">
                                    {t(
                                        'show-config-profiles-with-inbounds.feature.choose-a-profile-to-configure-inbounds-for-this-node'
                                    )}
                                </Text>
                            </Stack>
                        </Group>
                    </SectionCard.Section>

                    <SectionCard.Section>
                        <Button
                            color="cyan"
                            fullWidth
                            leftSection={<TbFilePlus size={16} />}
                            onClick={openProfileDrawer}
                            size="sm"
                            variant="light"
                        >
                            {t('common.action.select')}
                        </Button>
                    </SectionCard.Section>
                </>
            )}
        </SectionCard.Root>
    )
}
