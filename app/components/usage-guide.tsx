export default function UsageGuide() {
  return (
    <div className="help-content">
      <p>这是一个非官方 NovelAI 绘画提示词辅助工具，帮助查找和组合标签，不会调用绘画模型或生成图片。</p>
      <section aria-labelledby="guide-discover">
        <h3 id="guide-discover">发现标签</h3>
        <ol>
          <li>
            <strong>挑选与复制</strong>：按分类、子分组浏览，或输入中英文关键词筛选。
            点击卡片加入“我的提示词”，再次点击取消；卡片右上角的复制图标可单独复制该标签，不改变选择。
            星标用于收藏，收藏保存在当前浏览器。
          </li>
          <li>
            <strong>组合提示词</strong>：逐项或批量加减权，也可重置、移除或清空已选标签。
            手机端点击右侧悬浮的“提示词”入口展开“我的提示词”抽屉，关闭后继续选词，已选标签会保留。
            加权格式在大括号、圆括号和 NovelAI 数值格式之间循环切换，保留权重档位。
            提示词预览、整组复制和单标签复制都会把名称内部的空格转为下划线，例如
            <code>misaka mikoto</code> 输出为 <code>misaka_mikoto</code>。
          </li>
          <li>
            <strong>提示词查找</strong>：粘贴已有提示词，查看各标签的中英文、分类和未匹配项。
            查找时会识别加减权语法，支持空格与下划线形式；未匹配不代表标签无效，只代表当前目录未收录。
          </li>
          <li>
            <strong>个人法典与成人法典</strong>：按章节、标题或组内标签查找配方，
            可复制单组或整个标题下的全部组，也可用“查找组内标签”查看对应词条。
            法典按原文复制，颜色和其他占位符需要自行替换。
          </li>
        </ol>
      </section>
      <section aria-labelledby="guide-search">
        <h3 id="guide-search">搜索标签</h3>
        <ol>
          <li>
            <strong>搜索互联网标签</strong>：在顶部进入“搜索标签”，输入中文、英文描述或粘贴已有 tags 后提交。
            这里通过 Danbooru Tag Searcher API 查询 Danbooru 标签，不局限于发现页已收录的目录；
            加减权语法会自动去除，重复标签会合并。
          </li>
          <li>
            <strong>查看与复制结果</strong>：展开说明查看完整中文别名、英文标签和释义；
            每张结果卡片可单独复制，搜索结果区也可“复制全部”。资料链接可查看标签详情或画师作品。
          </li>
          <li>
            <strong>继续查找推荐</strong>：点击搜索结果或同类标签卡片，将其加入推荐依据，
            自动查询“推荐擅长画师”“同类标签”和“关联推荐”。更换搜索词不会清空推荐依据；
            可逐项移除或清空。这里的选择不会加入发现页的“我的提示词”。
          </li>
          <li>
            <strong>历史与成人标签</strong>：搜索历史保存在当前浏览器，可以重新搜索、删除或清空。
            成人标签默认关闭，启用前需要确认已满 18 岁；关闭后会过滤成人结果和相应推荐依据。
            成功结果缓存一天，服务失败时可保留条件重试。
          </li>
        </ol>
      </section>
      <section aria-labelledby="guide-ai">
        <h3 id="guide-ai">AI 搜索</h3>
        <p>
          顶部“AI 搜索”提供 llm.txt、llm.md、Skill、MCP 配置与 OpenAPI；
          可复制文件内容或 URL，也可下载后交给支持相应格式的 AI 客户端。
          只读接口支持英文 Tag 查中文、中文查 Tags，默认查本站普通标签目录。
          显式选择 Danbooru 搜索时使用公共额度，不使用本站私有 Key；
          公共服务可能限流或不可用，不会自动改用私有额度。
        </p>
      </section>
      <section aria-labelledby="guide-source">
        <h3 id="guide-source">数据来源与隐私</h3>
        <p>
          Tags 的例图由 Danbooru 提供，可能与 tag 本身的意思并没有关系，仅供参考。
          组合词条以首个标签查询例图；画师已有的本地画风参考图保留原来源。
          例图按需加载，图片地址及无图结果缓存一周，请求失败不会缓存。
        </p>
        <p>
          数据来自互联网公开的标签站点、社区整理的法典和 Danbooru 数据库，
          并非 NovelAI 官方词库。翻译、说明和推荐可能有遗漏或偏差，绘画效果因模型版本而异。
        </p>
        <p className="help-caveat">
          发现页优先使用可用缓存或随站点提供的目录，后台更新不会阻断浏览。
          搜索页需要网络，提交的搜索词和推荐依据会发送至标签搜索服务，不写入本站数据库。
          收藏、搜索历史及个性化设置保存在当前浏览器，不会跨设备自动同步。
        </p>
      </section>
    </div>
  );
}
