import {
    buildUserRouteEditPatch,
    createUserRouteEditValues,
    hasUserRouteEditChanges,
    isUserRouteEditHoppingValid
} from '@features/dashboard/speed-limits/model/user-route-edit'
import {
    Alert,
    Button,
    Group,
    Modal,
    Select,
    SimpleGrid,
    Stack,
    Text,
    TextInput
} from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PortHoppingConfig, SpeedLimit, UserRoute, useUpdateUserRoute } from '@shared/api/hooks'

interface EditUserRouteModalProps {
    route: UserRoute
    context: {
        user: string
        node: string
        inbound: string
        host: string
    }
    speedLimits: SpeedLimit[]
    hoppingConfigs: PortHoppingConfig[]
    onClose: () => void
}

export function EditUserRouteModal({
    route,
    context,
    speedLimits,
    hoppingConfigs,
    onClose
}: EditUserRouteModalProps) {
    const { t } = useTranslation()
    const updateRoute = useUpdateUserRoute()
    const [values, setValues] = useState(() => createUserRouteEditValues(route))
    const eligibleConfigs = hoppingConfigs.filter(
        (config) =>
            route.network === 'udp' &&
            config.enabled &&
            config.configProfileInboundUuid === route.configProfileInboundUuid
    )
    const currentConfig = hoppingConfigs.find(
        (config) => config.uuid === route.portHoppingConfigUuid
    )
    const currentConfigUnavailable =
        route.portHoppingConfigUuid !== null &&
        !eligibleConfigs.some((config) => config.uuid === route.portHoppingConfigUuid)
    const hoppingValid = isUserRouteEditHoppingValid(route, values, hoppingConfigs)
    const hasChanges = hasUserRouteEditChanges(route, values)
    const formatPool = (config: PortHoppingConfig) =>
        t('speed-limits.hopping.route-option', {
            start: config.poolStart,
            end: config.poolEnd,
            ports: config.portsPerUser,
            seconds: config.hopIntervalSeconds
        })

    const close = () => {
        if (!updateRoute.isPending) onClose()
    }
    const save = () => {
        if (updateRoute.isPending || !hasChanges || !hoppingValid) return
        updateRoute.mutate({
            variables: buildUserRouteEditPatch(route, values),
            mutationFns: { onSuccess: onClose }
        })
    }

    return (
        <Modal
            closeOnClickOutside={!updateRoute.isPending}
            closeOnEscape={!updateRoute.isPending}
            onClose={close}
            opened
            size="lg"
            title={t('speed-limits.routes.edit')}
            withCloseButton={!updateRoute.isPending}
        >
            <Stack>
                <Text c="dimmed" size="sm">
                    {t('speed-limits.routes.edit-description')}
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <TextInput
                        label={t('speed-limits.fields.user')}
                        readOnly
                        value={context.user}
                    />
                    <TextInput
                        label={t('speed-limits.fields.node')}
                        readOnly
                        value={context.node}
                    />
                </SimpleGrid>
                <TextInput
                    label={t('speed-limits.fields.proxy-core-inbound')}
                    readOnly
                    value={context.inbound}
                />
                <TextInput label={t('speed-limits.fields.host')} readOnly value={context.host} />
                <TextInput
                    label={t('speed-limits.fields.ports')}
                    readOnly
                    value={`:${route.externalPort} → ${route.internalAddress}:${route.internalPort}/${route.network.toUpperCase()}`}
                />
                <Select
                    allowDeselect={false}
                    data={[
                        { label: t('speed-limits.common.unlimited'), value: '' },
                        ...speedLimits.map((speed) => ({ label: speed.name, value: speed.uuid })),
                        ...(route.speedLimitUuid &&
                        !speedLimits.some((speed) => speed.uuid === route.speedLimitUuid)
                            ? [
                                  {
                                      label: t('speed-limits.routes.current-policy-unavailable'),
                                      value: route.speedLimitUuid,
                                      disabled: true
                                  }
                              ]
                            : [])
                    ]}
                    disabled={updateRoute.isPending}
                    label={t('speed-limits.fields.speed-policy')}
                    onChange={(value) =>
                        setValues((current) => ({ ...current, speedLimitUuid: value || null }))
                    }
                    value={values.speedLimitUuid ?? ''}
                />
                <Select
                    allowDeselect={false}
                    data={[
                        { label: t('speed-limits.routes.canonical-port-only'), value: '' },
                        ...eligibleConfigs.map((config) => ({
                            label: formatPool(config),
                            value: config.uuid
                        })),
                        ...(currentConfigUnavailable && route.portHoppingConfigUuid
                            ? [
                                  {
                                      label: currentConfig
                                          ? `${formatPool(currentConfig)} · ${t('speed-limits.common.disabled')}`
                                          : t('speed-limits.routes.current-hopping-unavailable'),
                                      value: route.portHoppingConfigUuid,
                                      disabled: true
                                  }
                              ]
                            : [])
                    ]}
                    description={
                        eligibleConfigs.length
                            ? t('speed-limits.routes.hopping-available-description')
                            : t('speed-limits.routes.hopping-unavailable-description')
                    }
                    disabled={
                        updateRoute.isPending ||
                        (!eligibleConfigs.length && !route.portHoppingConfigUuid)
                    }
                    error={
                        hoppingValid
                            ? undefined
                            : t('speed-limits.routes.invalid-hopping-selection')
                    }
                    label={t('speed-limits.hopping.title')}
                    onChange={(value) =>
                        setValues((current) => ({
                            ...current,
                            portHoppingConfigUuid: value || null
                        }))
                    }
                    value={values.portHoppingConfigUuid ?? ''}
                />
                <Text c="dimmed" size="sm">
                    {route.hopStartPort !== null && route.hopEndPort !== null
                        ? t('speed-limits.routes.hy2-hopping', {
                              start: route.hopStartPort,
                              end: route.hopEndPort
                          })
                        : t('speed-limits.routes.hopping-unassigned')}
                </Text>
                {currentConfigUnavailable && (
                    <Alert color="yellow">
                        {t('speed-limits.routes.keep-unavailable-hopping')}
                    </Alert>
                )}
                <Alert color="blue">{t('speed-limits.routes.edit-hopping-description')}</Alert>
                <Group justify="flex-end">
                    <Button disabled={updateRoute.isPending} onClick={close} variant="default">
                        {t('common.action.cancel')}
                    </Button>
                    <Button
                        disabled={!hasChanges || !hoppingValid}
                        loading={updateRoute.isPending}
                        onClick={save}
                    >
                        {t('speed-limits.routes.save-and-verify')}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    )
}
