import type { editor } from 'monaco-editor'

import { ConfigEditorActionsFeature } from '@features/dashboard/config-profiles/config-editor-actions'
import { ConfigValidationFeature } from '@features/dashboard/config-profiles/config-validation'
import {
    getConfigProfileModelUri,
    isConfigProfileCoreType
} from '@features/dashboard/config-profiles/config-validation/core-validation.ts'
import { createVisualDraft } from '@features/dashboard/config-profiles/config-validation/visual-draft.ts'
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

    const [initialVisualDraft] = useState(() =>
        props.initialMode === 'visual'
            ? createVisualDraft(JSON.stringify(configProfile.config), configProfile.coreType)
            : null
    )
    const [result, setResult] = useState('')
    const [isConfigValid, setIsConfigValid] = useState(true)
    const [readySchemaKey, setReadySchemaKey] = useState<string | null>(null)
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
    const [mode, setMode] = useState<'visual' | 'json'>(props.initialMode ?? 'json')
    const [isVisualSaving, setIsVisualSaving] = useState(false)
    const [jsonValue, setJsonValue] = useState(JSON.stringify(configProfile.config, null, 2) || '')
    const [visualConfig, setVisualConfig] = useState<JsonObject | null>(
        initialVisualDraft?.config ?? null
    )
    const [visualDocument, setVisualDocument] = useState<VisualDocument | null>(
        initialVisualDraft?.document ?? null
    )
    const [visualError, setVisualError] = useState<string | null>(
        props.initialMode === 'visual' && !initialVisualDraft
            ? t('visual-config-builder.errors.json-invalid')
            : null
    )
    const [visualChangeDescription, setVisualChangeDescription] = useState('')
    const [originalValue, setOriginalValue] = useState<string>(
        JSON.stringify(configProfile.config, null, 2) || ''
    )

    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
    const wasWasmRestarting = useRef(false)
    const visualValidationSequence = useRef(0)

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
            (hasUnsavedChanges || isVisualSaving) &&
            currentLocation.pathname !== nextLocation.pathname
    )

    const parseCurrentJson = (): JsonObject | null => {
        const currentValue = editorRef.current?.getValue() ?? jsonValue
        setJsonValue(currentValue)
        try {
            const parsed: unknown = JSON.parse(currentValue)
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error(t('visual-config-builder.errors.json-object'))
            }
            return parsed as JsonObject
        } catch {
            setVisualError(t('visual-config-builder.errors.json-invalid'))
            setVisualDocument(null)
            setVisualConfig(null)
            setMode('visual')
            return null
        }
    }

    const handleModeChange = (nextMode: 'visual' | 'json') => {
        if (nextMode === mode || isVisualSaving) return

        if (nextMode === 'visual') {
            const parsed = parseCurrentJson()
            editorRef.current = null
            if (!parsed) return
            setVisualConfig(parsed)
            setVisualDocument(parseConfigProfile(parsed, coreType))
            setVisualError(null)
            setMode('visual')
            return
        }

        if (visualError) {
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

    const handleVisualChange = (nextConfig: JsonObject, description: string) => {
        setVisualConfig(nextConfig)
        setVisualDocument(parseConfigProfile(nextConfig, coreType))
        setVisualChangeDescription(description)
        setHasUnsavedChanges(JSON.stringify(nextConfig, null, 2) !== originalValue)
        setResult('')
    }

    const validateVisualValue = async (value: string): Promise<boolean> => {
        if (
            !monaco ||
            !isSchemaReady ||
            (coreType === 'xray' && (isWasmCrashed || isWasmRestarting))
        )
            return false

        // The graphical editor has no mounted JSON editor. Give the shared validator
        // a temporary model with the same core-specific schema, then dispose it.
        const uri = monaco.Uri.parse(
            getConfigProfileModelUri(
                coreType,
                `${configProfile.uuid}-visual-save-${++visualValidationSequence.current}`
            )
        )
        let model: editor.ITextModel | null = null
        let valid = false
        try {
            model = monaco.editor.createModel(value, 'json', uri)
            const validationModel = model
            await ConfigValidationFeature.validate(
                {
                    current: {
                        getValue: () => validationModel.getValue(),
                        getModel: () => validationModel
                    }
                },
                setResult,
                (nextValid) => {
                    valid = nextValid
                    setIsConfigValid(nextValid)
                },
                snippetMap,
                coreType
            )
            return valid
        } catch {
            setIsConfigValid(false)
            setResult(t('visual-config-builder.errors.schema-unavailable'))
            return false
        } finally {
            model?.dispose()
        }
    }

    const handleSavedValue = (value: string) => {
        setJsonValue(value)
        const draft = createVisualDraft(value, coreType)
        setVisualConfig(draft?.config ?? null)
        setVisualDocument(draft?.document ?? null)
        setVisualChangeDescription('')
    }

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
                onConfigChange={handleVisualChange}
            />
            <OutboundVisualManager
                config={visualConfig ?? visualDocument.rawSnapshot}
                coreType={visualDocument.coreType}
                document={visualDocument}
                onConfigChange={handleVisualChange}
            />
            <RoutingVisualManager
                config={visualConfig ?? visualDocument.rawSnapshot}
                coreType={visualDocument.coreType}
                document={visualDocument}
                onConfigChange={handleVisualChange}
            />
            <DnsVisualManager
                config={visualConfig ?? visualDocument.rawSnapshot}
                coreType={visualDocument.coreType}
                document={visualDocument}
                onConfigChange={handleVisualChange}
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
                            disabled={isVisualSaving}
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
                        <fieldset className={styles.visualFieldset} disabled={isVisualSaving}>
                            {visualOverview}
                        </fieldset>
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
                    <Stack gap="xs" style={{ width: '100%' }}>
                        {statusBar}
                        <Group justify="space-between">
                            <Text c="dimmed" size="sm">
                                {visualChangeDescription ||
                                    t(
                                        hasUnsavedChanges
                                            ? 'config-editor.widget.unsaved-changes'
                                            : 'visual-config-builder.no-pending-changes'
                                    )}
                            </Text>
                            <Group>
                                <Button
                                    disabled={isVisualSaving}
                                    onClick={() => handleModeChange('json')}
                                    variant="light"
                                >
                                    {t('visual-config-builder.review-json')}
                                </Button>
                                <ConfigEditorActionsFeature
                                    saveOnly
                                    saveDisabled={
                                        !isSchemaReady ||
                                        !visualConfig ||
                                        !!visualError ||
                                        (coreType === 'xray' && (isWasmCrashed || isWasmRestarting))
                                    }
                                    configProfile={configProfile}
                                    coreType={coreType}
                                    editorRef={editorRef}
                                    getSaveValue={() => JSON.stringify(visualConfig, null, 2)}
                                    validateBeforeSave={validateVisualValue}
                                    onSaved={handleSavedValue}
                                    onSavingChange={setIsVisualSaving}
                                    hasUnsavedChanges={hasUnsavedChanges}
                                    isConfigValid={isConfigValid}
                                    originalValue={originalValue}
                                    setHasUnsavedChanges={setHasUnsavedChanges}
                                    setIsConfigValid={setIsConfigValid}
                                    setOriginalValue={setOriginalValue}
                                    setResult={setResult}
                                />
                            </Group>
                        </Group>
                    </Stack>
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
                        onSaved={handleSavedValue}
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
