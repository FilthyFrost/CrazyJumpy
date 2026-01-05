import Phaser from 'phaser';
import GameScene from './scenes/GameScene';

// Mobile portrait mode configuration
// Target aspect ratio: 9:16 (typical phone)

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#87CEEB',  // Sky blue background

  // RESIZE mode for true full-screen (no white bars)
  scale: {
    mode: Phaser.Scale.RESIZE,  // Dynamically resize to fill entire viewport
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },

  pixelArt: true,
  antialias: false,

  // Enable touch input
  input: {
    touch: true,
    activePointers: 2,  // Support multi-touch
  },

  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false
    }
  },
  scene: [GameScene]
};

new Phaser.Game(config);
