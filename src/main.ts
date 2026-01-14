import Phaser from 'phaser';
import MainMenuScene from './scenes/MainMenuScene';
import GameScene from './scenes/GameScene';

// Mobile portrait mode configuration
// Target aspect ratio: 9:16 (typical phone)

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#1a1a2e',  // Dark background for menu

  // Fixed portrait dimensions for mobile (540x960)
  scale: {
    mode: Phaser.Scale.FIT,  // Fit to viewport while maintaining aspect ratio
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 540,
    height: 960,
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
  scene: [MainMenuScene, GameScene],  // MainMenuScene 作为第一个场景
  fps: {
    target: 60,
    // 使用 requestAnimationFrame (默认) 而非 setTimeout，性能更好
  }
};

new Phaser.Game(config);
