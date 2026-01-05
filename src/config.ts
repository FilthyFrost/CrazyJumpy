export const GameConfig = {
    // ===================================================================
    // 调试开关
    // ===================================================================
    debug: false,                     // 开发调试日志 (生产环境设为 false)

    // ===================================================================
    // 全局物理
    // ===================================================================
    gravity: 1500,                    // 重力加速度 (px/s²)

    // ===================================================================
    // 空中控制 (按住SPACE快速下落)
    // ===================================================================
    air: {
        baseFastFallAccel: 4000,      // 基础快速下落加速度
        fastFallRamp: 15000,          // 按住增益 (Increased to keep accel growing)
        maxFastFallAccel: 60000,      // 最大加速度 (Raised significantly to prevent accel clamp)
        releaseDecay: 0.05,           // 松开衰减

        // Terminal Velocities
        terminalFallSpeed: 15000,     // 正常自由落体上限
        terminalFastFallSpeed: 200000,// 快速下落上限 (Virtually uncapped for visual feel)

        // Energy Charge Time
        fastFallChargeTime: 0.25,     // 需要按住多久才能获得满额收益 (秒)

        // Energy Calculation Caps (decouple from visual physics)
        energyVyCap: 6000,            // 能量计算的速度上限 (防止极端终端速度导致失衡)
        energyAccelCap: 6000,         // 能量计算的加速度上限
    },

    // ===================================================================
    // 地面物理与反弹
    // ===================================================================
    ground: {
        // ----- 撞击 → 压缩深度 -----
        impactScale: 0.00003,         // 撞击速度 → 压缩深度的系数
        maxDepth: 150,                // 最大压缩深度 (px)

        // ----- 压缩时间 (Log曲线随高度增加) -----
        compressTime: 0.12,           // 基础压缩时间 (秒) - 低高度
        compressLogScale: 0.5,        // Log系数: 高度越高压缩时间越长

        // ----- 黄色区间 (Perfect Timing Window) -----
        yellowDuration0: 0.15,        // 低高度时黄色持续时间 (秒)
        yellowDurationMin: 0.03,      // 最小黄色持续时间 (秒)
        difficultyLogScale: 0.8,      // 难度Log系数: 高度越高黄色时间越短
        difficultyRefHeight: 5000,    // 参考高度 (px) - 约100m

        // ----- 起跳速度限制 -----
        baseLaunchVelocity: -600,     // 最小起跳速度
        hardCapVelocity: 50000,       // 绝对速度上限
        softCapVelocity: 2600,        // 软上限速度 (仅对非Perfect生效)
        softCapFactor: 0.25,          // 超出软上限后只保留25%

        // ----- Perfect指数增长 (核心游戏循环) -----
        // Perfect: 高度增长 = lastApex * (1 + growthRate) + bonus
        // growthRate = 15% + 5% * log10(height/100)
        // bonus = 50px + 5% * lastApex
        // (这些值现在硬编码在ChargingState中, 可根据需要提取)

        // ----- 惩罚系数 (硬编码在ChargingState中) -----
        // Normal: 保留 70% 高度
        // Failed: 保留 40% 高度
        // 无快速下落: 保留 70% 高度

        // ----- 连击系统 (硬编码在ChargingState中) -----
        // 3次连续Perfect = 2倍增益

        // ----- 按太久失败 (Hold Lockout) -----
        peakEps: 1.0,                 // 判定到达压缩峰值的容差
        sweetHoldGrace0: 0.10,        // 低高度时松开宽容窗口 (秒)
        sweetHoldGraceMin: 0.02,      // 高高度下最小窗口 (秒)
        failHoldTime0: 0.12,          // 低高度时进入lockout的延迟
        failHoldTimeMin: 0.03,        // 高高度下最小延迟
        overHoldAccelK0: 8.0,         // 按太久惩罚加速基础值
        overHoldAccelKGain: 6.0,      // 按太久惩罚随难度增益
        overHoldAccelTime: 0.25,      // 惩罚加速的时间常数
        deadEfficiency: 0.05,         // 效率低于此值直接失败

        // ----- 无输入时吸收/静止 -----
        absorbRelaxTime: 0.02,        // 无输入时压缩释放时间
        settleEps: 2,                 // 判定静止的压缩容差
        idleRelaxAfterPeak: 0.18,     // 峰值后无输入释放时间
        fatigueTime: 0.1,             // 疲劳衰减时间 (按太久时)
        relaxTime: 0.2,               // 压缩释放时间 (按太久时)

        // ----- 地面形变视觉 -----
        releaseRecoverTime: 0.1,      // 起跳后地面恢复时间
        deformFollowTime: 0.02,       // 地面形变跟随时间

        // ----- 能量守恒基础 (备用) -----
        restBase: 0.85,               // 基础恢复系数 (能量损失)
    },

    // ===================================================================
    // 里程碑设置
    // ===================================================================
    milestone: {
        yOffset: 30,  // 里程碑线Y轴微调（正值=向下，负值=向上）像素
    },

    // ===================================================================
    // 显示设置
    // ===================================================================
    display: {
        pixelsPerMeter: 50,           // 1米 = 50像素
        playerSize: 200,               // 角色显示大小 (像素) - 增大以便手机上看清
        playerCollisionRadius: 100,    // 角色碰撞半径 (像素) - 应匹配实际可见区域
        playerYOffset: 80,           // 角色Y偏移量 (负值=向上, 正值=向下) - 修正视觉中心点
    },
};
