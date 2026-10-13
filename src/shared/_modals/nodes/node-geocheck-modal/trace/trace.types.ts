export interface IGeocheckHop {
    addr?: string
    addrs?: string[]
    as_name?: string
    asn?: number
    avg_ms: number
    best_ms: number
    host?: string
    loss: number
    recv: number
    sent: number
    ttl: number
    worst_ms: number
}

export interface IGeocheckTransit {
    asn: number
    name: string
    ttl: number
}

export interface IGeocheckTarget {
    anycast?: boolean
    dest_as_name?: string
    dest_asn?: number
    excess_ms: number
    hops: IGeocheckHop[]
    host: string
    id: string
    jitter_ms: number
    loss: number
    method?: string
    name: string
    notes?: string[]
    resolved?: string
    rtt_ms: number
    score: number
    transits?: IGeocheckTransit[]
    verdict: string
}

export interface IGeocheckConnectivity {
    breakdown?: Record<string, number>
    icmp_available?: boolean
    latency_floor_ms?: number
    privileged?: boolean
    score?: number
    targets: IGeocheckTarget[]
}

export interface IGeocheckHopSegment {
    asName: string
    asn: null | number
    hops: IGeocheckHop[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const finiteNumber = z.number().finite()
const hopSchema = z.object({
    addr: z.string().optional(),
    addrs: z.array(z.string()).optional(),
    as_name: z.string().optional(),
    asn: finiteNumber.optional(),
    avg_ms: finiteNumber,
    best_ms: finiteNumber,
    host: z.string().optional(),
    loss: finiteNumber,
    recv: finiteNumber,
    sent: finiteNumber,
    ttl: finiteNumber,
    worst_ms: finiteNumber
})
const connectivitySchema = z.object({
    breakdown: z.record(z.string(), finiteNumber).optional(),
    icmp_available: z.boolean().optional(),
    latency_floor_ms: finiteNumber.optional(),
    privileged: z.boolean().optional(),
    score: finiteNumber.optional(),
    targets: z.array(
        z.object({
            anycast: z.boolean().optional(),
            dest_as_name: z.string().optional(),
            dest_asn: finiteNumber.optional(),
            excess_ms: finiteNumber,
            hops: z.array(hopSchema),
            host: z.string(),
            id: z.string(),
            jitter_ms: finiteNumber,
            loss: finiteNumber,
            method: z.string().optional(),
            name: z.string(),
            notes: z.array(z.string()).optional(),
            resolved: z.string().optional(),
            rtt_ms: finiteNumber,
            score: finiteNumber,
            transits: z
                .array(z.object({ asn: finiteNumber, name: z.string(), ttl: finiteNumber }))
                .optional(),
            verdict: z.string()
        })
    )
})

export const resolveConnectivity = (rawReport: unknown): IGeocheckConnectivity | null => {
    for (const candidate of [rawReport, isRecord(rawReport) ? rawReport.connectivity : null]) {
        const result = connectivitySchema.safeParse(candidate)
        if (result.success) return result.data
    }

    return null
}

export const groupHopsByAs = (hops: IGeocheckHop[]): IGeocheckHopSegment[] => {
    const segments: IGeocheckHopSegment[] = []

    for (const hop of hops) {
        const asn = hop.asn ?? null
        const last = segments.at(-1)

        if (last && last.asn === asn && (asn !== null || !hop.addr)) {
            last.hops.push(hop)
            continue
        }

        segments.push({ asn, asName: hop.as_name ?? '', hops: [hop] })
    }

    return segments
}

export const isTimedOutHop = (hop: IGeocheckHop): boolean => !hop.addr || hop.recv === 0

export const VERDICT_COLORS: Record<string, string> = {
    detour: 'orange',
    direct: 'teal',
    failed: 'red',
    intercepted: 'red',
    'on-net': 'teal',
    peered: 'green',
    regional: 'green',
    transit: 'yellow',
    unreachable: 'gray'
}

export const resolveVerdictColor = (verdict: string): string => VERDICT_COLORS[verdict] ?? 'gray'
import { z } from 'zod'
