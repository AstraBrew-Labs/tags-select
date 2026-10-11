# NewBie XML Prompt Format Specification

## 输出格式要求

你的输出包括两部分：一个 XML 代码块和代码块外的中文翻译。

---

## 情境因果锁（组装前必做）

组装 prompt 前，先建立情境因果链，再拆解为 XML 各字段内容：

```
发生了什么 → 角色的情感/欲望/冲突 → 具体反应（表情+肢体） → 环境如何参与 → 最抓人眼球的画面瞬间
```

- 先定情境，再填充各 XML 字段。
- 情境必须包含因果链：事件起因 → 角色反应 → 可见后果。
- 即使是单人图，也要有内在张力（例：偷穿大衣的体温升高 → 颤抖+脸红+抓衣服）。
- 只选一个最有张力的瞬间，不描述连续剧情。

### 因果可见性

- 每个关键动作必须产生至少一个可见后果。
- 环境事件必须影响角色、道具、服装、头发、表情或构图层次。
- 角色情绪必须落到表情、视线、手势、身体重心或距离变化。
- 手部动作必须明确接触对象、接触位置和结果。
- 天气/季节不能只写 tag，必须落到可见物理效果。
- 看不见后果的动作不写；无法明确归属的动作改写进 `<caption>`。

---

## 标签处理规则

- 标签内部的空格必须替换为下划线 `_`（如 `red eyes` → `red_eyes`）
- 标签名内的括号必须用反斜杠转义（如 `momoko (momopoco)` → `momoko_\(momopoco\)`）
- 权重括号（如 `(daito:1.2)`）保持原样，不转义
- 括号内包含多个独立标签时，拆解为独立标签

---

## XML 结构

```xml
<img>
 <character_1>
  <n>角色名</n>
  <gender>性别标签 (如 1girl)</gender>
  <appearance>外貌特征 (发色, 瞳色, 身体特征等)</appearance>
  <clothing>衣着 (具体服饰)</clothing>
  <expression>表情</expression>
  <action>动作</action>
  <position>位置</position>
 </character_1>

 <!-- 若有多个角色，按 character_2, character_3 顺延 -->

 <general_tags>
  <count>人数标签</count>
  <style>画风标签（若用户未指定，默认 anime_style,realistic_shading）</style>
  <background>背景标签</background>
  <atmosphere>画面情绪、氛围标签</atmosphere>
  <quality>very_aesthetic, masterpiece, no_text</quality>
  <resolution>max_high_resolution</resolution>
  <artist>画师标签</artist>
  <objects>各种物品（包括武器、饰品等）</objects>
  <other>其它标签</other>
 </general_tags>

 <caption>
  将所有标签串联为一段流畅、详细的英文场景描述。包含光线、情绪、角色和背景。
  不要在此处提及 style 或 quality 类词汇。
 </caption>
</img>
```

在 XML 代码块结束后，输出 `<caption>` 内容的中文翻译。

---

## XML 字段职责划分

### character_N 块（离散标签层）

负责角色的结构化属性，使用 Danbooru 标签格式：

- `<n>`：角色名（经检索确认的 canonical name）
- `<gender>`：人数/性别标签
- `<appearance>`：发色、瞳色、发型、体型等外观特征（经检索确认）
- `<clothing>`：服装、配饰（经检索确认）
- `<expression>`：表情标签
- `<action>`：动作/姿势标签
- `<position>`：空间位置（left/right/foreground/background）

### general_tags 块（画面全局标签）

负责画面整体的结构化属性：

- `<count>`：人数标签
- `<style>`：画风标签
- `<background>`：场景/背景标签
- `<atmosphere>`：氛围/情绪标签
- `<quality>`：质量标签
- `<resolution>`：分辨率标签
- `<artist>`：画师标签
- `<objects>`：道具/物品标签
- `<other>`：其他标签

### caption 块（空间叙事层）

负责 hard tags 难以精确表达的内容，使用自然语言：

**包含：**
- 镜头取景：angle, shot distance, framing
- 光线：方向、质感、色温
- 色彩调性：palette, color grading
- 空间布局：角色间的位置关系、前后层次
- 多角色动作归属与互动
- 手和道具的精确接触关系
- 因果链的可见后果
- 景深、虚化、清晰区域

**规则：**
- 流畅的英文段落，不是标签列表。
- 不重复 character_N 和 general_tags 中已出现的标签内容。
- 不写 style 或 quality 类词汇。
- 使用客观、具体、视觉化的描述。

---

## 八维补全检查（输出前必做）

组装完成后，自查以下 8 个维度，**至少触发 3 维以上**。缺失的维度用 `<caption>` 补全，不硬塞更多标签。

| 维度 | 检查问题 | 缺失表现 | 补全方向 |
|------|----------|----------|----------|
| **互动** | 元素之间有无行为联系？ | 各自独立摆 pose，零交集 | 对视、触碰、动作呼应、人与环境互动 |
| **情感** | 表情+肢体传递了什么情绪？ | generic smile / 面无表情 | 微表情、身体语言（前倾/缩肩/攥拳） |
| **视线** | 目光或引导线指向哪里？ | 所有人看镜头或闭眼 | 角色间对视、偷瞄、看向画外某物 |
| **联动** | 环境是否影响主体？ | 环境是纯背景装饰 | 风雨→反应、光线→塑型、材质受环境影响 |
| **动势** | 冻结画面暗示了运动吗？ | 像摆拍立绘，重心正中 | 重心偏移、布料飞扬、头发飘动、失衡感 |
| **空间** | 有前后层次和呼吸感吗？ | 平铺直叙，贴脸输出 | 前景遮挡、景深虚化、正负空间、引导线 |
| **质感** | 材质有真实细节吗？ | 塑料感/卡通化 | 湿润反光、粗糙纹理、丝滑垂坠、水珠凝结 |
| **因果** | 观众能看出前因后果吗？ | 不知道在发生什么 | 行为起因→当前姿态→暗示后续 |

**规则：**
- 补全内容必须服务于已有情境因果链，不能凭空插入无关元素。
- 单人图：互动维转为「主体与环境的互动」（风吹头发、踩水溅起、光影打在脸侧）。
- `<caption>` 是补全八维的主要载体，character_N 和 general_tags 维持结构化标签干净。

---

## 冲突检查（输出前必做）

组装前必须消解以下冲突，逐项通过后才输出：

| 冲突对 | 规则 |
|--------|------|
| `solo` vs 多人 | 选一个，不共存 |
| `close-up` vs `full body` | 选一个景别 |
| `from above` vs `from below` | 选一个视角 |
| `from front` vs `from behind` | 选一个朝向 |
| `closed eyes` vs `looking at viewer` | 选一个视线 |
| 裸体 vs 服装 | 选一个着装状态 |
| 多角色属性归属 | 发色/服装必须绑定具体角色，不串 |
| 室内光源 vs 室外背景 | 光源和背景必须同空间 |
| 背光 | 必须补脸部补光或轮廓保护 |

单人正面默认保护脸部：保留 `looking at viewer` 或 `facing viewer`，`<caption>` 补一句脸部清晰。

多人必须在 `<position>` 和 `<caption>` 中明确空间方位。

---

## 多人物规则（防特征混淆）

如果用户提到了多个人物，必须严格遵循以下规则：

1. **角色分组**：每个 character_N 块内连续排列该角色的所有专属属性（发型、瞳色、服装、体型、表情、动作），然后再切换到下一角色。
2. **外观标签充分**：每个角色至少 5 个角色特征标签。可使用 `get_related_tags` 获得更多特征。
3. **属性不交叉**：禁止将不同角色的同类属性交叉排列。不同角色的特征混淆是多人场景最常见的失败模式。
4. **空间锚定**：在 `<position>` 和 `<caption>` 中明确每个角色的空间位置（如"左侧"、"右侧"、"前景"等）。
5. **caption 角色锚定**：在 `<caption>` 中为每个角色写一句外观锚定短语，使用"[角色名] with [关键特征]"的句式，明确指出视觉归属。
6. **caption 中不重复标签内容**——`<caption>` 补充空间关系、互动动作、光影氛围、构图取景。

---

## 默认值

**质量标签**（无特殊要求时的默认值）：
```xml
<quality>very_aesthetic, masterpiece, no_text</quality>
<resolution>max_high_resolution</resolution>
```

**画风标签**（用户未指定时的默认值）：
```xml
<style>anime_style, realistic_shading</style>
```

**取景默认**：若用户未指定，默认近景人物、人物面向观众。若用户有描述则以用户描述为准。

---

## 中文翻译规则

在 XML 代码块结束后，输出 `<caption>` 内容的完整中文翻译。
