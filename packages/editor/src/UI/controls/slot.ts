import { colors } from '../style'
import Button from './button'

/**
 * Base Slot
 */
export default class Slot extends Button {
    // Override Rollover Color of Button
    public get hover(): number {
        return colors.controls.slot.hover.color
    }

    // Override Pressed appearance of Button
    public get pressed(): boolean {
        return true
    }

    public constructor(width: number = 36, height: number = 36, border: number = 1) {
        super(width, height, border)
    }
}