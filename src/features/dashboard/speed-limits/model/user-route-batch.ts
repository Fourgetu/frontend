import { buildCreateUserRoutePayload } from './speed-limit.ts'

type RoutePayload = ReturnType<typeof buildCreateUserRoutePayload>
type RouteInput = Omit<Parameters<typeof buildCreateUserRoutePayload>[0], 'userId'>

export interface RouteBatchUser {
    value: string
    label: string
}

export type RouteBatchResult = RouteBatchUser &
    (
        | { status: 'pending' | 'creating' }
        | { status: 'success'; externalPort: number }
        | { status: 'failed'; error: unknown }
    )

export const getFailedRouteUserIds = (results: RouteBatchResult[]) =>
    results.filter((result) => result.status === 'failed').map((result) => result.value)

export async function createUserRoutesSequentially({
    users,
    input,
    create,
    onProgress
}: {
    users: RouteBatchUser[]
    input: RouteInput
    create: (payload: RoutePayload) => Promise<{ externalPort: number }>
    onProgress: (results: RouteBatchResult[]) => void
}): Promise<RouteBatchResult[]> {
    const uniqueUsers = [...new Map(users.map((user) => [user.value, user])).values()]
    const jobs = uniqueUsers.map((user) => ({
        user: { ...user },
        payload: buildCreateUserRoutePayload({
            ...input,
            userId: user.value,
            // The server allocates each user's port. A manual port cannot be shared.
            externalPort: uniqueUsers.length > 1 ? '' : input.externalPort
        })
    }))
    const results: RouteBatchResult[] = jobs.map(({ user }) => ({ ...user, status: 'pending' }))
    onProgress([...results])

    // Creating a route also applies and verifies the node configuration. Await each
    // operation before allocating another port or applying the next configuration.
    for (const [index, { user, payload }] of jobs.entries()) {
        results[index] = { ...user, status: 'creating' }
        onProgress([...results])
        try {
            const route = await create(payload)
            results[index] = { ...user, status: 'success', externalPort: route.externalPort }
        } catch (error) {
            results[index] = { ...user, status: 'failed', error }
        }
        onProgress([...results])
    }
    return results
}
