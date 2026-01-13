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
    // 镜头与角色抖动 (Camera & Character Shake)
    // ===================================================================
    cameraShake: {
        enable: true,                 // 全局开关

        // --- 全局参数 ---
        tauIn: 0.1,                   // 强度上升平滑时间 (秒)
        tauOut: 0.2,                  // 强度下降平滑时间 (秒)
        maxTotalAmpX: 30,             // 最终合成最大X偏移 (px)
        maxTotalAmpY: 10,             // 最终合成最大Y偏移 (px)

        // --- 地面蓄力抖动 (Ground Charging) ---
        charge: {
            // 触发门槛
            pStart: 0.72,             // 开始抖动的压缩比 (接近黄区)
            pPeak: 0.90,              // 达到峰值的压缩比 (黄区阈值)
            approachPow: 2.0,         // 接近曲线指数 (越高越突变)

            // 强度计算 (log映射)
            holdGamma: 2.2,           // 按压时间占比的指数增益
            heightRef: 5000,          // 参考高度 (px)
            xMax: 20000,              // 最大有效输入高度 (px)
            k: 1.5,                   // log增益系数

            // 振幅与频率
            ampXMax: 12,              // 最大X振幅 (px)
            ampYMax: 2,              // 最大Y振幅 (px) - 垂直抖动更明显
            freqMin: 8,              // 最小频率 (Hz)
            freqMax: 18,              // 最大频率 (Hz) - 蓄力越满越快

            // 衰减
            postPeakTau: 0.1,         // 达到峰值后的衰减时间常数
        },

        // --- 高空乱流抖动 (Airborne Turbulence) ---
        air: {
            // 高度映射
            refHeight: 3000,          // 开始抖动的参考高度 (px)
            maxHeight: 20000,         // 达到最大抖动的高度 (px)
            pow: 1.4,                 // 强度曲线指数

            // 振幅与频率
            ampXMax: 10,              // 最大X振幅 (px)
            ampYMax: 8,               // 最大Y振幅 (px)
            freqMin: 2.0,             // 低空频率 (Hz)
            freqMax: 6.0,             // 高空频率 (Hz)
        }
    },

    // ===================================================================
    // 地面震颤 (Ground Impact Shake)
    // ===================================================================
    groundShake: {
        enable: true,                 // 全局开关

        // --- 强度计算 (Impact Logic) ---
        heightRef: 5000,              // 参考高度 (px)
        holdGamma: 2.2,               // 按压时间占比的指数增益 (1.8~2.5)
        k: 1.5,                       // log增益系数
        xMax: 20000,                  // 归一化上限输入高度 (px)

        // --- 全局震颤 (Global Shake) ---
        ampXMaxPx: 6,                 // 全局最大X震幅 (px)
        ampYMaxPx: 16,                // 全局最大Y震幅 (px)
        freqMin: 12,                  // 最小频率 (Hz)
        freqMax: 25,                  // 最大频率 (Hz) - 冲击更猛烈
        decayTau: 0.15,               // 衰减时间常数 (秒)
        perfectBoost: 1.3,            // Perfect/黄区额外乘子

        // --- 局部波纹 (Ripple) ---
        ripple: {
            enable: true,
            radiusCols: 8,            // 波纹影响半径列数
            impulseMaxPx: 12,         // 局部额外震幅 (px)
            falloffPow: 2.0,          // 距离衰减指数
            stiffness: 120,           // 波纹回弹硬度
            damping: 8,               // 波纹阻尼
        },

        // --- 安全限制 ---
        globalClamp: 30,              // 最终合成最大偏移限制 (px)
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
        corpseYOffset: 80,           // 尸体Y偏移量 (正值=向下) - 死亡动画时调整位置
        zoom: 0.85,                   // 默认相机缩放 (1.0 = 正常, 0.85 = 视野更广)
        skyGradientHeightOffset: 200,  // 背景颜色抽取高度偏移 (米) - 正值=颜色偏高, 调整初始色调

        // 血量条设置
        healthBarWidth: 84,           // 血量条宽度 (像素)
        healthBarHeight: 12,          // 血量条高度 (像素)
        healthBarOffsetY: -60,        // 血量条Y偏移 (负值=在角色上方)
    },

    // ===================================================================
    // 三通道换道系统 (Lane Switch System)
    // ===================================================================
    lane: {
        count: 3,                     // 通道数量 (左/中/右)
        tweenDuration: 100,           // 换道动画时长 (毫秒)
        tweenEase: 'Quad.easeOut',    // 缓动曲线 (瞬移感)

        // ----- 手势阈值 (基于540×960画布) -----
        swipeDistRatio: 0.03,         // 滑动触发距离比例 (3% = ~18px on 540w)
        moveTolRatio: 0.012,          // 按住移动容差比例 (1.2% = ~8px on 540w)
        holdDelayMs: 80,              // 按住判定延迟 (毫秒)
        swipeCooldownMs: 10,         // 换道冷却时间 (毫秒)
    },

    // ===================================================================
    // 怪物系统 (Monster System)
    // ===================================================================
    monster: {
        // ----- 生成参数 -----
        minSpacing: 5,               // 怪物之间最小Y轴间距 (米)

        // ----- 移动参数 -----
        moveSpeedMin: 20,             // 最小移动速度 (像素/秒)
        moveSpeedMax: 60,             // 最大移动速度 (像素/秒)
        directionChangeInterval: 2000, // 方向改变的平均间隔 (毫秒)
        directionChangeVariance: 1500, // 方向改变的随机变化范围

        // ----- A01 怪物 -----
        a01: {
            minHeight: 20,            // 最小生成高度 (米)
            maxHeight: 1000,           // 最大生成高度 (米)
            spawnProbability: 0.70,   // 每10米生成概率 (70%)
            frameRate: 8,             // 动画帧率
            size: 48,                 // 显示大小 (像素)
        },
    },

    // ===================================================================
    // 子弹时间系统 (Bullet Time System)
    // ===================================================================
    bulletTime: {
        costPerUse: 3,              // 每次使用消耗 (秒)
        duration: 3.0,                // 每次持续时间 (秒) - 真实时间
        cooldown: 0.2,                // 冷却时间 (秒) - 真实时间
        timeScale: 0.35,               // 子弹时间时的游戏速度 (0.5x)
        minActivationHeight: 50,      // 最小激活高度 (米)

        maxEnergyBase: 12.0,           // 基础能量上限 (秒)
        maxEnergyExtended: 16.0,       // 扩展能量上限 (秒)

        energyPerKill: 0.2,           // 击杀回能 (秒)
        killRefundCap: 1.0,           // 击杀总共可获得的最大上限扩展 (秒)
    },

    // ===================================================================
    // UI 配置 (UI Configuration)
    // ===================================================================
    ui: {
        // ----- 高度指示器 (Height Text) -----
        heightText: {
            fontSizePercent: 0.08,       // 字体大小 (屏幕宽度百分比)
            maxFontSize: 160,              // 最大字体大小 (像素)
            yOffset: 80,                 // 玩家下方偏移 (像素)
        },

        // ----- 子弹时间图标 (Bullet Time Icon) -----
        bulletTimeIcon: {
            size: 120,                     // 图标大小 (像素)
            yOffset: 210,                 // 玩家下方偏移 (像素)
        },
    },
};
