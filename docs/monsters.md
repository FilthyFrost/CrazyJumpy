# CrazyJumpy 怪物机制文档（按当前代码实现）

> 说明：本文件基于当前代码的**真实实现**整理（并非仅看配置注释）。
> 关键源码：
> - `src/objects/MonsterManager.ts`（刷新/概率/生成区域/命中与碰撞）
> - `src/objects/slime/ChargingState.ts`（起跳时触发生成 + NORMAL/Perfect 乘子）
> - `src/objects/PickupManager.ts`（掉落真实概率，含 NORMAL 材料减半）
> - `src/objects/Slime.ts`（DEBUFF 效果实现：中毒与 CloudA 减速）
> - `src/config.ts`（导演系统参数、怪物尺寸/帧率、UI 等）

---

## 1. 总览：怪物刷新机制（当前真实行为）

### 1.1 刷新时机（不是常驻刷怪）
- 怪物由“动态导演系统”驱动：**每次起跳（从地面蓄力松开）时**根据本次跳跃的**预测顶点高度**，一次性在顶点附近生成一批怪。
- 落地后会清空所有怪（“一跳一舞台”）。

### 1.2 触发条件
- 本次落地判定为 **PERFECT 或 NORMAL**，且
- 预测顶点高度 **> 50m**

> 代码位置：`ChargingState` 计算 `predictedApexPx = vLaunch^2 / (2g)`，转为米后做条件判断；满足才调用 `MonsterManager.spawnApexMonsters(...)`。

### 1.3 PERFECT vs NORMAL 的差异（刷新层面）
- **PERFECT**
  - 怪物数量倍率：`countMultiplier = 1.0`
  - 掉落材料倍率：`materialDropMultiplier = 1.0`
- **NORMAL**
  - 怪物数量倍率：`countMultiplier = 0.5`
  - 掉落材料倍率：`materialDropMultiplier = 0.5`
  - 铜币掉率不变（仅材料减半）

### 1.4 刷新高度区域（顶点附近生成区）
用预测顶点高度 `apexHeightM`（米）计算生成区间：
- 下界：`rangeStartM = apexHeightM * 0.85`
- 上界：`rangeEndM = apexHeightM * dynamicRangeEnd`

其中：
- `dynamicRangeEnd = minEnd + (baseEnd - minEnd) * exp(-apexHeightM / tau)`
- 默认参数来自 `GameConfig.monster.director`：`baseEnd=0.98`、`minEnd=0.91`、`tau=600`

含义：高度越高，“顶端安全区”越大（上界越低），给玩家砍完怪后留出准备时间。

### 1.5 刷新数量（每跳生成多少只）
- 先对数增长：
  - `targetCount = baseCount`（当 `apexHeightM <= refHeightM`）
  - 否则 `targetCount = floor(baseCount + log2(apexHeightM / refHeightM) * countGrowthFactor)`
- clamp 到 `[baseCount, maxCount]`
- 再乘以判定倍率：`targetCount = max(1, round(targetCount * countMultiplier))`

默认参数：
- `baseCount=4`、`maxCount=12`、`refHeightM=50`、`countGrowthFactor=2.5`

### 1.6 怪物移动速度倍率（随高度变快）
- `speedMultiplier = 1.0 + (apexHeightM / speedRefHeightM) * speedGrowthFactor`
- clamp 到 `maxSpeedMultiplier`

默认：`speedRefHeightM=400`、`speedGrowthFactor=1.5`、`maxSpeedMultiplier=3.0`

### 1.7 落地清场
- 玩家落地调用 `MonsterManager.onPlayerLanded()`：当前所有怪物淡出销毁并清空数组。

---

## 2. 怪物类型选择：高度 → 概率（权重池抽取）

> `selectMonsterType(heightM)` 会计算每个怪物在该生成高度 `heightM` 的权重 weight，
> 然后按 `概率 = weight / (所有候选 weight 之和)` 进行一次随机抽取。

### 2.1 A01（史莱姆）权重曲线
- 0–200m：`w=1.0`
- 200–600m：线性下降到 0
- 600m+：`w=0`

公式：
- `h < 200: wA01 = 1`
- `200 <= h < 600: wA01 = 1 - (h-200)/(600-200)`
- `h >= 600: wA01 = 0`

### 2.2 A02（蝙蝠）权重曲线
- 200–600m：线性上升 0→1
- 600–1000m：指数下降 `exp(-3*progress)`（100% → ~5%）
- 其它：0

公式：
- `200 <= h < 600: wA02 = (h-200)/400`
- `600 <= h < 1000: wA02 = exp(-3 * ((h-600)/400))`

### 2.3 A03（骷髅）权重曲线
- 600–1000m：线性上升 0→1
- 1000m+：`w=1.0`

公式：
- `600 <= h < 1000: wA03 = (h-600)/400`
- `h >= 1000: wA03 = 1`

### 2.4 CloudA（云怪）权重曲线
- 400–800m：线性上升 0→1
- 800–1100m：线性下降 1→0.1
- 其它：0

公式：
- `400 <= h < 800: wCloud = (h-400)/400`
- `800 <= h < 1100: wCloud = 1 - 0.9 * ((h-800)/300)`

---

## 3. 负面效果（DEBUFF）：触发与具体效果

### 3.1 触发条件（空中“身体碰撞未砍中”）
- 仅在玩家 `AIRBORNE` 时运行身体碰撞检测：`MonsterManager.checkDebuffCollision(...)`
- 且会被多层“先判击杀再判负面”的保护窗口阻止：
  - **挥刀窗口免疫**：`Slime.hasSwingGrace(now)`
  - **击杀后短窗**：`Slime.hasRecentHitWindow(now)`
  - **击杀/命中免疫**：`Slime.hasDebuffGrace(now)` / `Slime.hasRecentHitGrace(now)`
  - **击杀ID集合**：`slime.recentKilledIds.has(monster.id)`
  - 怪物自身的 `noDebuffUntil` / `nextDebuffTime` 节流

### 3.2 A01：中毒 I
- 碰撞触发：`poison1Duration += 1s`，上限 `5s`
- 伤害：持续期间每秒 `1 HP/s`

### 3.3 A02：中毒 II
- 碰撞触发：`poison2Duration += 1s`，上限 `5s`
- 伤害：持续期间每秒 `2 HP/s`

> 中毒可叠加：若 I 和 II 同时存在，合计每秒 `3 HP/s`。

### 3.4 CloudA：一次性减速（方向阻尼）
- 碰撞触发：对当前速度做阻尼
  - `vy *= 0.6`（保留 60% 速度）
- 视觉提示：`slowImpulseTimer = 0.4s`

### 3.5 A03：当前无负面
- `applyDebuffFromMonster` 没有为 `A03` 写任何 debuff 分支，等价于“撞到不施加负面”。

---

## 4. 掉落物（真实生效概率）

> 重要：`src/config.ts` 里存在 `GameConfig.pickup.drops` 配置，但当前代码并没有读取它。
> **真实生效**的掉落概率来自 `src/objects/PickupManager.ts -> spawnMonsterDrops()`（写死逻辑）。

### 4.1 全局掉落倍率（NORMAL 惩罚）
- `materialDropMultiplier`：
  - PERFECT：1.0
  - NORMAL：0.5
- 铜币掉率不受该倍率影响；材料掉率乘以倍率。

### 4.2 A01 掉落
- 铜币：100% ×1
- gem：50% × `materialDropMultiplier`
  - PERFECT：50%
  - NORMAL：25%

### 4.3 A02 掉落
- 铜币：100% ×1
- 额外铜币：60% ×1（不受倍率影响）
- wing：20% × `materialDropMultiplier`
  - PERFECT：20%
  - NORMAL：10%

### 4.4 A03 掉落
- 铜币：100% ×2
- wing：40% × `materialDropMultiplier`
  - PERFECT：40%
  - NORMAL：20%

### 4.5 CloudA 掉落
- 铜币：100% ×1
- gem：35% × `materialDropMultiplier`
  - PERFECT：35%
  - NORMAL：17.5%

---

## 5. 备注：怪物配置（尺寸/帧率）
来自 `src/config.ts -> GameConfig.monster`：
- A01：`size=48`，`frameRate=8`
- A02：`size=48`，`frameRate=10`
- A03：`size=48`，`frameRate=8`
- CloudA：`size=52`，`frameRate=10`

