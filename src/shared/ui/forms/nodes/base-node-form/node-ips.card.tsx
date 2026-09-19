import { UseFormReturnType } from '@mantine/form'
import { ForwardRefComponent, HTMLMotionProps, Variants } from 'motion/react'

import type { ConcurrentNodeFormValues } from '@shared/api/types/concurrent-node.schema'
import { NodeIpsEditor } from '@shared/ui/node-ips'

interface IProps<T extends ConcurrentNodeFormValues> {
    cardVariants: Variants
    form: UseFormReturnType<T>
    motionWrapper: ForwardRefComponent<HTMLDivElement, HTMLMotionProps<'div'>>
}

export const NodeIpsCard = <T extends ConcurrentNodeFormValues>(props: IProps<T>) => {
    const { cardVariants, form, motionWrapper } = props

    const MotionWrapper = motionWrapper

    return (
        <MotionWrapper variants={cardVariants}>
            <NodeIpsEditor form={form} key={form.key('ips')} />
        </MotionWrapper>
    )
}
