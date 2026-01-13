
import type Slime from '../Slime';

export interface ISlimeState {
    enter(slime: Slime): void;
    update(slime: Slime, dt: number, isSpaceDown: boolean, justPressed: boolean, justReleased: boolean): void;
    exit(slime: Slime): void;
}
