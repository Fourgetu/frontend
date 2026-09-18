import type { editor } from 'monaco-editor'

import { ConfigEditorActionsFeature } from '@features/dashboard/config-profiles/config-editor-actions'
import { ConfigValidationFeature } from '@features/dashboard/config-profiles/config-validation'
import {
    getConfigProfileModelUri,
    isConfigProfileCoreType
} from '@features/dashboard/config-profiles/config-validation/core-validation.ts'
import { MonacoSetupFeature } from '@features/dashboard/config-profiles/monaco-setup'
import {
    Alert,
    Badge,
    Box,
    Button,
    Card,
    Code,
    Group,
    Loader,
    Paper,
    SegmentedControl,
    SimpleGrid,
    Stack,
    Text,
    Title
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMonaco } from '@monaco-editor/react'
import clsx from 'clsx'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbAlertTriangle } from 'react-icons/tb'
import { useBlocker } from 'react-router'

import { usePseudoFullscreen, useViewportFillHeight } from '@shared/hooks'
import { CodeEditor, editorClasses, EditorFooter, EditorStatusBar } from '@shared/ui/code-editor'
import { FullscreenToggleButton, fullscreenClasses } from '@shared/ui/fullscreen-toggle-button'
import { LoaderModalShared } from '@shared/ui/loader-modal'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { preventBackScroll } from '@shared/utils/misc'

import {
    parseConfigProfile,
    type JsonObject,
    type VisualDocument,
    type VisualSummary
} from '@entities/config-profile-visual'
import { DnsVisualManager } from '@entities/config-profile-visual/dns-manager.tsx'
import { InboundVisualManager } from '@entities/config-profile-visual/inbound-manager.tsx'
import { OutboundVisualManager } from '@entities/config-profile-visual/outbound-manager.tsx'
import { RoutingVisualManager } from '@entities/config-profile-visual/routing-manager.tsx'

import styles from './ConfigEditor.module.css'
import { IProps } from './interfaces'

export function ConfigEditorWidget(props: IProps) {
    const { t, i18n } = useTranslation()
    const monaco = useMonaco()

    const { configProfile, isWasmCrashed, isWasmRestarting, onRestartWasm, snippets } = props

    const [result, setResult] = useState('')
    const [isConfigValid, setIsConfigValid] = useState(true)
    const [readySchemaKey, setReadySchemaKey] = useState<string | null>(null)
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
    const [mode, setMode] = useState<'visual' | 'json'>('json')
    const [jsonValue, setJsonValue] = useState(JSON.stringify(configProfile.config, null, 2) || '')
    const [visualConfig, setVisualConfig] = useState<JsonObject | null>(null)
    const [visualDocument, setVisualDocument] = useState<VisualDocument | null>(null)
    const [visualError, setVisualError] = useState<string | null>(null)
    const [visualChangeDescription, setVisualChangeDescription] = useState('')
    const [originalValue, setOriginalValue] = useState<string>(
        JSON.stringify(configProfile.config, null, 2) || ''
    )

    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
    const wasWasmRestarting = useRef(false)

    const coreType = configProfile.coreType
    const hasKnownCoreType = isConfigProfileCoreType(coreType)
    const schemaKey = hasKnownCoreType ? `${coreType}:${i18n.language}` : null
    const isSchemaReady = schemaKey !== null && readySchemaKey === schemaKey
    const snippetMap = useMemo(
        () => new Map(snippets.snippets.map((snippet) => [snippet.name, snippet.snippet])),
        [snippets.snippets]
    )

    const { isFullscreen, toggle: toggleFullscreen } = usePseudoFullscreen()
    const { containerRef: editorWrapperRef, footerRef } = useViewportFillHeight({
        enabled: !isFullscreen && mode === 'json'
    })

    useEffect(() => {
        if (!monaco || !hasKnownCoreType) return

        let cancelled = false
        void MonacoSetupFeature.setup(i18n.language, snippets.snippets, coreType)
            .then(() => {
                if (cancelled) return
                setReadySchemaKey(schemaKey)
                if (!editorRef.current) return
                void ConfigValidationFeature.validate(
                    editorRef,
                    setResult,
                    setIsConfigValid,
                    snippetMap,
                    coreType
                )
            })
            .catch(() => {
                if (cancelled) return
                setReadySchemaKey(null)
                setIsConfigValid(false)
                setResult(t('visual-config-builder.errors.schema-unavailable'))
            })

        return () => {
            cancelled = true
        }
    }, [
        coreType,
        hasKnownCoreType,
        i18n.language,
        monaco,
        schemaKey,
        snippetMap,
        snippets.snippets,
        t
    ])

    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            hasUnsavedChanges && currentLocation.pathname !== nextLocation.pathname
    )

    const parseCurrentJson = (): JsonObject | null => {
        const currentValue = editorRef.current?.getValue() ?? jsonValue
        try {
            const parsed: unknown = JSON.parse(currentValue)
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error(t('visual-config-builder.errors.json-object'))
            }
            return parsed as JsonObject
        } catch {
            setVisualError(t('visual-config-builder.errors.json-invalid'))
            setVisualDocument(null)
            setMode('visual')
            return null
        }
    }

    const handleModeChange = (nextMode: 'visual' | 'json') => {
        if (nextMode === mode) return

        if (nextMode === 'visual') {
            const parsed = parseCurrentJson()
            if (!parsed) return
            setVisualConfig(parsed)
            setVisualDocument(parseConfigProfile(parsed, coreType))
            setVisualError(null)
            setMode('visual')
            return
        }

        if (visualError && !visualConfig) {
            setVisualError(null)
            setMode('json')
            return
        }

        const nextValue = JSON.stringify(visualConfig ?? configProfile.config, null, 2)
        setJsonValue(nextValue)
        setVisualError(null)
        setMode('json')
    }

    useEffect(() => {
        if (
            coreType === 'xray' &&
            wasWasmRestarting.current &&
            !isWasmRestarting &&
            !isWasmCrashed &&
            editorRef.current
        ) {
            void ConfigValidationFeature.validate(
                editorRef,
                setResult,
                setIsConfigValid,
                snippetMap,
                coreType
            )
        }
        wasWasmRestarting.current = isWasmRestarting
    }, [coreType, isWasmRestarting, isWasmCrashed, snippetMap])

    const checkForChanges = () => {
        if (!editorRef.current) return

        const currentValue = editorRef.current.getValue()
        const hasChanges = currentValue !== originalValue
        setHasUnsavedChanges(hasChanges)
    }

    useLayoutEffect(() => {
        document.body.addEventListener('wheel', preventBackScroll, {
            passive: false
        })
        return () => {
            document.body.removeEventListener('wheel', preventBackScroll)
        }
    }, [])

    useEffect(() => {
        if (blocker.state === 'blocked') {
            modals.openConfirmModal({
                title: (
                    <BaseOverlayHeader
                        iconColor="red"
                        IconComponent={TbAlertTriangle}
                        iconSize={20}
                        iconVariant="soft"
                        title={t('config-editor.widget.unsaved-changes')}
                    />
                ),
                children: t(
                    'config-editor.widget.your-changes-will-be-lost-if-you-leave-this-page-without-saving'
                ),
                centered: true,
                labels: {
                    confirm: t('config-editor.widget.leave'),
                    cancel: t('config-editor.widget.stay')
                },

                confirmProps: {
                    color: 'red',
                    variant: 'soft'
                },
                cancelProps: {
                    variant: 'light'
                },
                onConfirm: () => {
                    blocker.proceed()
                },
                onCancel: () => {
                    blocker.reset()
                },
                closeOnConfirm: true,
                closeOnCancel: true
            })
        }
    }, [blocker])

    if (!hasKnownCoreType) {
        return (
            <Alert color="red" title={t('visual-config-builder.errors.core-type-missing')}>
                {t('visual-config-builder.errors.core-type-missing-description')}
            </Alert>
        )
    }

    const modelUri = getConfigProfileModelUri(coreType, configProfile.uuid)

    const statusBar = (result || isWasmRestarting || isWasmCrashed) && (
        <EditorStatusBar
            status={isWasmCrashed || isWasmRestarting || !isConfigValid ? 'error' : 'success'}
        >
            {isWasmRestarting && (
                <Group gap="xs">
                    <Loader color="orange" size="xs" />
                    <Code className={styles.statusCode} color="orange">
                        {t('visual-config-builder.status.xray-restarting')}
                    </Code>
                </Group>
            )}
            {!isWasmRestarting && isWasmCrashed && (
                <Group gap="sm">
                    <Code className={styles.statusCode} color="red">
                        {t('visual-config-builder.status.xray-crashed')}
                    </Code>
                    <Button color="red" onClick={onRestartWasm} size="compact-xs" variant="light">
                        {t('restart-node-button.feature.restart')}
                    </Button>
                </Group>
            )}
            {!isWasmRestarting && !isWasmCrashed && result}
        </EditorStatusBar>
    )

    const renderSummary = (label: string, summary: VisualSummary) => (
        <Card key={label} withBorder padding="md" radius="md">
            <Group justify="space-between" mb="xs">
                <Text fw={600}>{label}</Text>
                <Badge variant="light" size="lg">
                    {summary.count}
                </Badge>
            </Group>
            {summary.items.length > 0 ? (
                <Stack gap={4}>
                    {summary.items.slice(0, 6).map((item) => (
                        <Group gap="xs" justify="space-between" key={item.id} wrap="nowrap">
                            <Text size="sm" truncate>
                                {item.label}
                            </Text>
                            {item.detail && (
                                <Badge color={item.readOnly ? 'gray' : 'blue'} variant="dot">
                                    {item.detail}
                                </Badge>
                            )}
                        </Group>
                    ))}
                    {summary.items.length > 6 && (
                        <Text c="dimmed" size="xs">
                            +{summary.items.length - 6} more
                        </Text>
                    )}
                </Stack>
            ) : (
                <Text c="dimmed" size="sm">
                    {t('visual-config-builder.none')}
                </Text>
            )}
        </Card>
    )

    const visualOverview = visualDocument && (
        <Stack className={styles.visualOverview} gap="md" p="md">
            {visualDocument.visualEditingLimited && (
                <Alert color="yellow" title={t('visual-config-builder.singbox-profile')}>
                    {t('visual-config-builder.visual-limited')}
                </Alert>
            )}
            <Card withBorder padding="md" radius="md">
                <Group justify="space-between">
                    <div>
                        <Text c="dimmed" size="sm">
                            {t('visual-config-builder.core')}
                        </Text>
                        <Title order={3}>
                            {visualDocument.coreType === 'xray' ? 'Xray' : 'sing-box'}
                        </Title>
                    </div>
                    <Badge color={visualDocument.coreType === 'xray' ? 'blue' : 'grape'} size="lg">
                        {visualDocument.coreType}
                    </Badge>
                </Group>
            </Card>
            <InboundVisualManager
                config={visualConfig ?? visualDocument.rawSnapshot}
                coreType={visualDocument.coreType}
                document={visualDocument}
                onConfigChange={(nextConfig, description) => {
                    setVisualConfig(nextConfig)
                    setVisualDocument(parseConfigProfile(nextConfig, coreType))
                    setVisualChangeDescription(description)
                    setHasUnsavedChanges(JSON.stringify(nextConfig, null, 2) !== originalValue)
                }}
            />
            <OutboundVisualManager
                config={visualConfig ?? visualDocument.rawSnapshot}
                coreType={visualDocument.coreType}
                document={visualDocument}
                onConfigChange={(nextConfig, description) => {
                    setVisualConfig(nextConfig)
                    setVisualDocument(parseConfigProfile(nextConfig, coreType))
                    setVisualChangeDescription(description)
                    setHasUnsavedChanges(JSON.stringify(nextConfig, null, 2) !== originalValue)
                }}
            />
            <RoutingVisualManager
                config={visualConfig ?? visualDocument.rawSnapshot}
                coreType={visualDocument.coreType}
                document={visualDocument}
                onConfigChange={(nextConfig, description) => {
                    setVisualConfig(nextConfig)
                    setVisualDocument(parseConfigProfile(nextConfig, coreType))
                    setVisualChangeDescription(description)
                    setHasUnsavedChanges(JSON.stringify(nextConfig, null, 2) !== originalValue)
                }}
            />
            <DnsVisualManager
                config={visualConfig ?? visualDocument.rawSnapshot}
                coreType={visualDocument.coreType}
                document={visualDocument}
                onConfigChange={(nextConfig, description) => {
                    setVisualConfig(nextConfig)
                    setVisualDocument(parseConfigProfile(nextConfig, coreType))
                    setVisualChangeDescription(description)
                    setHasUnsavedChanges(JSON.stringify(nextConfig, null, 2) !== originalValue)
                }}
            />
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
                {renderSummary(t('visual-config-builder.dns-servers'), visualDocument.dns)}
            </SimpleGrid>
            <Card withBorder padding="md" radius="md">
                <Group justify="space-between" mb="xs">
                    <Text fw={600}>{t('visual-config-builder.advanced-unsupported')}</Text>
                    <Badge color={visualDocument.unsupportedPaths.length ? 'orange' : 'teal'}>
                        {visualDocument.unsupportedPaths.length}
                    </Badge>
                </Group>
                {visualDocument.unsupportedPaths.length ? (
                    <Stack gap={3}>
                        <Text c="dimmed" size="sm">
                            {t('visual-config-builder.advanced-preserved')}
                        </Text>
                        {visualDocument.unsupportedPaths.slice(0, 12).map((path) => (
                            <Code key={path}>{path}</Code>
                        ))}
                    </Stack>
                ) : (
                    <Text c="dimmed" size="sm">
                        {t('visual-config-builder.no-advanced-fields')}
                    </Text>
                )}
            </Card>
        </Stack>
    )

    return (
        <Box className={clsx(styles.container, isFullscreen && fullscreenClasses.overlay)}>
            <Paper
                className={clsx(
                    styles.editorWrapper,
                    !isFullscreen && editorClasses.editorAttached,
                    mode === 'visual' && styles.visualEditorWrapper,
                    isFullscreen && fullscreenClasses.fill
                )}
                p={0}
                pos="relative"
                ref={editorWrapperRef}
                style={{
                    direction: 'ltr'
                }}
                withBorder
            >
                {!isFullscreen && (
                    <Group
                        justify="space-between"
                        p="xs"
                        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
                    >
                        <SegmentedControl
                            data={[
                                { label: t('visual-config-builder.visual'), value: 'visual' },
                                { label: t('visual-config-builder.json'), value: 'json' }
                            ]}
                            onChange={(value) => handleModeChange(value as 'visual' | 'json')}
                            value={mode}
                        />
                        {mode === 'visual' && (
                            <Text c="dimmed" size="sm">
                                {t('visual-config-builder.overview-only')}
                            </Text>
                        )}
                    </Group>
                )}

                {mode === 'visual' ? (
                    visualError ? (
                        <Stack p="md">
                            <Alert
                                color="red"
                                title={t('visual-config-builder.visual-unavailable')}
                            >
                                {visualError}
                            </Alert>
                            <Button onClick={() => handleModeChange('json')} variant="light">
                                {t('visual-config-builder.return-to-json')}
                            </Button>
                        </Stack>
                    ) : (
                        visualOverview
                    )
                ) : (
                    <>
                        {isFullscreen && (
                            <FullscreenToggleButton
                                isFullscreen={isFullscreen}
                                onToggle={toggleFullscreen}
                            />
                        )}

                        <CodeEditor
                            footer={statusBar}
                            className={styles.monacoEditor}
                            defaultLanguage="json"
                            loading={<LoaderModalShared mih="100%" />}
                            onChange={() => {
                                const currentValue = editorRef.current?.getValue() ?? ''
                                setJsonValue(currentValue)
                                if (
                                    isSchemaReady &&
                                    (coreType === 'singbox' ||
                                        (!isWasmCrashed && !isWasmRestarting))
                                ) {
                                    void ConfigValidationFeature.validate(
                                        editorRef,
                                        setResult,
                                        setIsConfigValid,
                                        snippetMap,
                                        coreType
                                    )
                                }

                                checkForChanges()
                            }}
                            onMount={(editor) => {
                                editorRef.current = editor

                                editor.getAction('editor.foldLevel7')?.run()

                                if (isSchemaReady) {
                                    void ConfigValidationFeature.validate(
                                        editorRef,
                                        setResult,
                                        setIsConfigValid,
                                        snippetMap,
                                        coreType
                                    )
                                }
                            }}
                            options={{
                                stickyScroll: { enabled: false }
                            }}
                            path={modelUri}
                            value={jsonValue}
                        />
                    </>
                )}
            </Paper>

            {!isFullscreen && mode === 'visual' && (
                <EditorFooter className={styles.visualFooter} ref={footerRef}>
                    <Group justify="space-between" style={{ width: '100%' }}>
                        <Text c="dimmed" size="sm">
                            {visualChangeDescription ||
                                t('visual-config-builder.no-pending-changes')}
                        </Text>
                        <Button onClick={() => handleModeChange('json')} variant="light">
                            {t('visual-config-builder.review-json')}
                        </Button>
                    </Group>
                </EditorFooter>
            )}

            {!isFullscreen && mode === 'json' && (
                <EditorFooter ref={footerRef}>
                    <FullscreenToggleButton
                        floating={false}
                        isFullscreen={isFullscreen}
                        onToggle={toggleFullscreen}
                        size={36}
                    />

                    <ConfigEditorActionsFeature
                        configProfile={configProfile}
                        coreType={coreType}
                        editorRef={editorRef}
                        hasUnsavedChanges={hasUnsavedChanges}
                        isConfigValid={isConfigValid}
                        originalValue={originalValue}
                        setHasUnsavedChanges={setHasUnsavedChanges}
                        setIsConfigValid={setIsConfigValid}
                        setOriginalValue={setOriginalValue}
                        setResult={setResult}
                    />
                </EditorFooter>
            )}
        </Box>
    )
}
