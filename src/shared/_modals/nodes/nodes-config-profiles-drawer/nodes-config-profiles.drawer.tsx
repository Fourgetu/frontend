import NiceModal, { useModal } from '@ebay/nice-modal-react'
import {
    clearCoreProfileSelection,
    ConcurrentProfileBindings,
    createConcurrentProfileSelection,
    getSelectedInboundUuids,
    selectCoreProfileInbounds,
    toConcurrentProfileBindings,
    toggleCoreProfileInbound
} from '@features/dashboard/nodes/config-profile-selection/model/concurrent-profile-selection'
import {
    Accordion,
    ActionIcon,
    Box,
    Drawer,
    Group,
    Stack,
    Text,
    TextInput,
    Tooltip
} from '@mantine/core'
import { GetConfigProfilesCommand } from '@remnawave/backend-contract'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbDeviceFloppy, TbSearch, TbX } from 'react-icons/tb'
import { Virtuoso } from 'react-virtuoso'

import { useNiceMantineModal } from '@shared/_modals/use-nice-modal'
import { useGetConfigProfiles } from '@shared/api/hooks'
import type { ConfigProfileCoreType } from '@shared/api/types/config-profile.type'
import { ConfigProfileCardShared } from '@shared/ui/config-profiles/config-profile-card/config-profile-card.shared'
import { XrayLogo } from '@shared/ui/logos'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'

import classes from './nodes-config-profiles.module.css'

interface IProps {
    activeConfigProfiles: ConcurrentProfileBindings
    allowedCoreTypes?: ConfigProfileCoreType[]
    onSaveInbounds: (bindings: ConcurrentProfileBindings) => void
}

export const NodesConfigProfilesDrawer = NiceModal.create((props: IProps) => {
    const { activeConfigProfiles, allowedCoreTypes = ['xray', 'singbox'], onSaveInbounds } = props
    const { t } = useTranslation()

    const modal = useModal()
    const { modalProps, hide } = useNiceMantineModal({
        modal,
        drawer: true
    })

    const { data: configProfiles, isLoading: isConfigProfilesLoading } = useGetConfigProfiles()

    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
    const [selection, setSelection] = useState(() =>
        createConcurrentProfileSelection(activeConfigProfiles)
    )
    const [openAccordions, setOpenAccordions] = useState<Set<string>>(
        new Set(
            [
                activeConfigProfiles.configProfile?.activeConfigProfileUuid,
                activeConfigProfiles.singBoxConfigProfile?.activeConfigProfileUuid
            ].filter((uuid): uuid is string => Boolean(uuid))
        )
    )

    const selectedInbounds = useMemo(() => getSelectedInboundUuids(selection), [selection])

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery)
        }, 300)

        return () => clearTimeout(timer)
    }, [searchQuery])

    const filteredProfiles = useMemo(() => {
        if (!configProfiles || !configProfiles.configProfiles) return []

        const availableProfiles = configProfiles.configProfiles.filter((profile) =>
            allowedCoreTypes.includes(profile.coreType)
        )

        if (!debouncedSearchQuery.trim()) {
            return availableProfiles
        }

        const query = debouncedSearchQuery.toLowerCase()
        return availableProfiles
            .filter((profile) => {
                if (profile.name.toLowerCase().includes(query)) return true
                return profile.inbounds.some(
                    (inbound) =>
                        inbound.tag.toLowerCase().includes(query) ||
                        inbound.type.toLowerCase().includes(query)
                )
            })
            .map((profile) => ({
                ...profile,
                inbounds: profile.inbounds.filter(
                    (inbound) =>
                        profile.name.toLowerCase().includes(query) ||
                        inbound.tag.toLowerCase().includes(query) ||
                        inbound.type.toLowerCase().includes(query)
                )
            }))
    }, [allowedCoreTypes, configProfiles, debouncedSearchQuery])

    const handleInboundToggle = useCallback(
        (
            inbound: GetConfigProfilesCommand.Response['response']['configProfiles'][number]['inbounds'][number]
        ) => {
            const profile = configProfiles?.configProfiles.find(
                (candidate) => candidate.uuid === inbound.profileUuid
            )
            if (!profile) return

            setSelection((current) =>
                toggleCoreProfileInbound(current, {
                    coreType: profile.coreType,
                    inboundUuid: inbound.uuid,
                    profileUuid: profile.uuid
                })
            )
        },
        [configProfiles]
    )

    const clearSelection = useCallback(() => {
        setSelection(
            createConcurrentProfileSelection({
                configProfile: null,
                singBoxConfigProfile: null
            })
        )
    }, [])

    const handleSaveInbounds = useCallback(() => {
        if (selectedInbounds.size === 0) return
        onSaveInbounds(toConcurrentProfileBindings(selection))

        hide()
    }, [hide, onSaveInbounds, selectedInbounds.size, selection])

    const handleSelectAllInbounds = useCallback(
        (profileUuid: string) => {
            const profile = configProfiles?.configProfiles.find((p) => p.uuid === profileUuid)
            if (!profile) return

            setSelection((current) =>
                selectCoreProfileInbounds(current, {
                    coreType: profile.coreType,
                    inboundUuids: profile.inbounds.map((inbound) => inbound.uuid),
                    profileUuid
                })
            )
        },
        [configProfiles]
    )

    const handleUnselectAllInbounds = useCallback(
        (profileUuid: string) => {
            const profile = configProfiles?.configProfiles.find((p) => p.uuid === profileUuid)
            if (!profile) return

            setSelection((current) =>
                clearCoreProfileSelection(
                    current,
                    profile.coreType as ConfigProfileCoreType,
                    profileUuid
                )
            )
        },
        [configProfiles]
    )

    const selectedProfiles = useMemo(
        () =>
            (['xray', 'singbox'] as const).flatMap((coreType) => {
                const coreSelection = selection[coreType]
                if (!coreSelection.profileUuid) return []

                const profile = configProfiles?.configProfiles.find(
                    (candidate) => candidate.uuid === coreSelection.profileUuid
                )
                if (!profile) return []

                return [
                    {
                        coreType,
                        name: profile.name,
                        selectedCount: coreSelection.inboundUuids.size
                    }
                ]
            }),
        [configProfiles, selection]
    )

    if (isConfigProfilesLoading || !configProfiles) return null

    return (
        <Drawer
            {...modalProps}
            padding="md"
            position="right"
            size="480px"
            styles={{
                body: {
                    height: 'calc(100% - 60px)',
                    display: 'flex',
                    flexDirection: 'column'
                }
            }}
            title={
                <BaseOverlayHeader
                    iconColor="teal"
                    IconComponent={XrayLogo}
                    iconVariant="soft"
                    title={t('config-profiles.drawer.widget.config-profiles')}
                />
            }
        >
            <Stack className={classes.drawerContent} gap="md">
                <Box
                    bdrs="md"
                    p="md"
                    style={{
                        border: '1px solid rgb(255, 255, 255, 0.08)',
                        background: 'rgb(255, 255, 255, 0.02)'
                    }}
                >
                    <Group align="center" justify="space-between" wrap="nowrap">
                        <Box>
                            {selectedProfiles.length > 0 ? (
                                <Stack gap={4}>
                                    {selectedProfiles.map((profile) => (
                                        <Box key={profile.coreType}>
                                            <Text fw={700} size="sm">
                                                {profile.name} ·{' '}
                                                {profile.coreType === 'singbox'
                                                    ? 'sing-box'
                                                    : 'Xray'}
                                            </Text>
                                            <Text c="dimmed" size="xs">
                                                {t(
                                                    'internal-squads.drawer.widget.selected-inbounds',
                                                    {
                                                        count: profile.selectedCount
                                                    }
                                                )}
                                            </Text>
                                        </Box>
                                    ))}
                                </Stack>
                            ) : (
                                <Box>
                                    <Text fw={700} size="sm">
                                        {t('common.message.no-profile-selected')}
                                    </Text>
                                    <Text c="dimmed" size="xs">
                                        {t('config-profiles.drawer.widget.no-inbounds-selected')}
                                    </Text>
                                </Box>
                            )}
                        </Box>

                        <Group gap="xs" wrap="nowrap">
                            <ActionIcon
                                color="red"
                                disabled={selectedInbounds.size === 0}
                                onClick={clearSelection}
                                size="lg"
                                variant="soft"
                            >
                                <TbX size={24} />
                            </ActionIcon>

                            <Tooltip label={t('common.action.save')}>
                                <ActionIcon
                                    color="teal"
                                    disabled={selectedInbounds.size === 0}
                                    onClick={handleSaveInbounds}
                                    size="lg"
                                    variant="soft"
                                >
                                    <TbDeviceFloppy size={24} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                    </Group>
                </Box>

                <TextInput
                    leftSection={<TbSearch size={16} />}
                    onChange={(event) => setSearchQuery(event.currentTarget.value)}
                    placeholder={t('common.message.search-profiles-or-inbounds')}
                    value={searchQuery}
                />

                {filteredProfiles.length === 0 ? (
                    <Text c="dimmed" py="xl" size="sm" ta="center">
                        {debouncedSearchQuery
                            ? t('common.message.no-profiles-or-inbounds-found')
                            : t('common.message.no-config-profiles-available')}
                    </Text>
                ) : (
                    <Box className={classes.listContainer}>
                        <Virtuoso
                            data={filteredProfiles}
                            itemContent={(_index, profile) => {
                                const isOpen = openAccordions.has(profile.uuid)
                                return (
                                    <div className={classes.itemWrapper}>
                                        <Accordion
                                            chevronPosition="left"
                                            onChange={(value) => {
                                                setOpenAccordions((prev) => {
                                                    const next = new Set(prev)
                                                    if (value === profile.uuid) {
                                                        next.add(profile.uuid)
                                                    } else {
                                                        next.delete(profile.uuid)
                                                    }
                                                    return next
                                                })
                                            }}
                                            value={isOpen ? profile.uuid : null}
                                            variant="separated"
                                        >
                                            <ConfigProfileCardShared
                                                isOpen={isOpen}
                                                onInboundToggle={handleInboundToggle}
                                                onSelectAllInbounds={handleSelectAllInbounds}
                                                onUnselectAllInbounds={handleUnselectAllInbounds}
                                                profile={profile}
                                                selectedInbounds={selectedInbounds}
                                            />
                                        </Accordion>
                                    </div>
                                )
                            }}
                            style={{ height: '100%' }}
                            useWindowScroll={false}
                        />
                    </Box>
                )}
            </Stack>
        </Drawer>
    )
})
