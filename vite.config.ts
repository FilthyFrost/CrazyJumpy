import { defineConfig } from 'vite'

export default defineConfig({
    base: '/CrazyJumpy/',
    server: {
        hmr: false,  // 禁用热更新，Phaser 与 HMR 不兼容
    },
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        // 确保资源文件正确复制
        copyPublicDir: true,
        // 优化分块
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        }
    }
})
