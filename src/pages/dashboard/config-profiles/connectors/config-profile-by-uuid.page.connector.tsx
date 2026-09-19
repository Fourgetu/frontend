import { consola } from 'consola/browser'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { app } from 'src/config'

import { useGetConfigProfile, useGetSnippets } from '@shared/api/hooks'
import { ROUTES } from '@shared/constants'
import { LoadingScreen } from '@shared/ui'
import { fetchWithProgress } from '@shared/utils/fetch-with-progress'

import { ConfigProfileByUuidPageComponent } from '../components/config-profile-by-uuid.page.component'

export function ConfigProfileByUuidPageConnector({
    initialMode = 'json'
}: { initialMode?: 'json' | 'visual' } = {}) {
    const { uuid } = useParams()

    const [downloadProgress, setDownloadProgress] = useState(0)
    const [isWasmLoading, setIsWasmLoading] = useState(false)
    const [isWasmReady, setIsWasmReady] = useState(false)
    const [isWasmCrashed, setIsWasmCrashed] = useState(false)
    const [isWasmRestarting, setIsWasmRestarting] = useState(false)
    const wasmBytesCache = useRef<ArrayBuffer | null>(null)
    const wasmInitializationStarted = useRef(false)

    const { data: configProfile, isLoading: isConfigProfileLoading } = useGetConfigProfile({
        route: { uuid: uuid! },
        rQueryParams: {
            enabled: !!uuid,
            refetchOnWindowFocus: false
        }
    })

    const { data: snippets, isLoading: isSnippetsLoading } = useGetSnippets({})

    const initWasm = useCallback(async (isRestart = false) => {
        if (!isRestart && wasmInitializationStarted.current) return
        wasmInitializationStarted.current = true

        if (isRestart) {
            setIsWasmRestarting(true)
            setIsWasmCrashed(false)
            setIsWasmReady(false)
        } else {
            setIsWasmLoading(true)
            setDownloadProgress(0)
        }

        try {
            const go = new window.Go()
            const wasmInitialized = new Promise<void>((resolve) => {
                window.onWasmInitialized = () => {
                    consola.info('WASM module initialized')
                    resolve()
                }
            })

            let wasmBytes: ArrayBuffer
            if (wasmBytesCache.current) {
                wasmBytes = wasmBytesCache.current
            } else {
                wasmBytes = await fetchWithProgress(app.configEditor.wasmUrl, setDownloadProgress)
                wasmBytesCache.current = wasmBytes
            }

            const { instance } = await WebAssembly.instantiate(wasmBytes, go.importObject)

            go.run(instance).then(() => {
                consola.warn('WASM module exited unexpectedly')
                setIsWasmCrashed(true)
            })

            await wasmInitialized

            if (typeof window.XrayParseConfig === 'function') {
                setIsWasmReady(true)
                setIsWasmLoading(false)
                setIsWasmRestarting(false)
            } else {
                throw new Error('XrayParseConfig not initialized')
            }
        } catch (err: unknown) {
            consola.error('WASM initialization error:', err)
            setIsWasmLoading(false)
            setIsWasmRestarting(false)
            setIsWasmCrashed(true)
        }
    }, [])

    const restartWasm = useCallback(() => {
        initWasm(true)
    }, [initWasm])

    useEffect(() => {
        if (configProfile?.coreType !== 'xray') return
        void Promise.resolve().then(() => initWasm())
    }, [configProfile?.coreType, initWasm])

    useEffect(() => {
        return () => {
            delete window.onWasmInitialized
        }
    }, [])

    if (!uuid) {
        return <Navigate to={ROUTES.DASHBOARD.MANAGEMENT.CONFIG_PROFILES} />
    }

    const isWaitingForXrayWasm =
        configProfile?.coreType === 'xray' && !isWasmReady && !isWasmCrashed

    if (
        isConfigProfileLoading ||
        !configProfile ||
        isSnippetsLoading ||
        !snippets ||
        isWasmLoading ||
        isWaitingForXrayWasm
    ) {
        return (
            <LoadingScreen
                text={
                    configProfile?.coreType === 'xray'
                        ? 'The Xray WASM module is loading...'
                        : 'The configuration profile is loading...'
                }
                value={downloadProgress}
            />
        )
    }

    return (
        <ConfigProfileByUuidPageComponent
            key={`${configProfile.uuid}:${initialMode}`}
            initialMode={initialMode}
            configProfile={configProfile}
            isWasmCrashed={isWasmCrashed}
            isWasmRestarting={isWasmRestarting}
            onRestartWasm={restartWasm}
            snippets={snippets}
        />
    )
}
