
import type Slime from '../Slime';
import type { ISlimeState } from './ISlimeState';
import { GameConfig } from '../../config';

export class IdleState implements ISlimeState {
    enter(slime: Slime): void {
        const groundYi = slime.getGroundY();
        slime.vy = 0;
        slime.y = groundYi;
        slime.currentCompression = 0;
    }

    update(slime: Slime, dt: number, _isSpaceDown: boolean, justPressed: boolean, _justReleased: boolean): void {
        const groundYi = slime.getGroundY();

        slime.y = groundYi;
        slime.vy = 0;

        // Ensure fully flat over time
        slime.currentCompression = slime.approach(slime.currentCompression, 0, dt, 0.08);

        if (justPressed) {
            slime.transitionTo('AIRBORNE');

            // Jump upward robustly
            slime.vy = -Math.abs(GameConfig.ground.baseLaunchVelocity);

            // Lift slightly to avoid re-contact
            slime.y = groundYi - 0.5;
            slime.prevVyForApex = slime.vy;

            slime.userAccel = 0;
            slime.holdTime = 0;
        }
    }

    exit(_slime: Slime): void {
        // No cleanup needed
    }
}
