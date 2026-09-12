export const mbpsToBytesPerSecond = (value: number): number => {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error('Mbps must be a finite, non-negative number')
    }
    return Math.round((value * 1_000_000) / 8)
}

export const bytesPerSecondToMbps = (value: number): number => {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error('Bytes per second must be a finite, non-negative number')
    }
    return (value * 8) / 1_000_000
}

export const isLoopbackAddress = (value: unknown): value is '127.0.0.1' | '::1' =>
    value === '127.0.0.1' || value === '::1'

export const getGostForwardNetwork = (inboundType: string): 'tcp' | 'udp' =>
    inboundType.toLowerCase().includes('hysteria') ? 'udp' : 'tcp'
