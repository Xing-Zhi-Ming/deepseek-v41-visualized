# DeepSeek-V4.1 原理图谱

一个用于理解 **DeepSeek-V4.1-Flash** 架构的交互式单页可视化。把 552B MoE、1M 上下文、890 B/token 的 global KV，以及 CED / CSA2 / FP4 / Engram / DSpark 拆成可以点击、拖拽和调参的模型图。

- 在线预览：<https://Xing-Zhi-Ming.github.io/deepseek-v41-visualized/>
- 源码仓库：<https://github.com/Xing-Zhi-Ming/deepseek-v41-visualized>

![页面预览](assets/preview.png)

## 这个页面讲什么

| 章节 | 交互 | 核心问题 |
| --- | --- | --- |
| 40 层模型图谱 | 3D 旋转、缩放、逐层点击、Prefill / Decode 切换 | 每一层在算什么，哪些 KV / 索引被复用？ |
| Causal Encoder-Decoder | 上下文长度滑杆、双轨计算量对比 | 为什么 prefill 只跑一半的层？ |
| CSA2 | Full / Reindex / Reuse 模式切换、40 层调度表 | 缓存共享和索引重算为什么要解耦？ |
| Hierarchical Sparse Indexer | 候选池动画、上下文长度滑杆 | 为什么长上下文下后续索引不再全扫？ |
| KV 缓存预算 | 代际柱状图、1M 上下文内存计算器 | 890 B/token、1/4、1/8 分别指什么？ |
| MoE 与 Engram | 专家路由、n-gram 哈希桶 | 552B 总参数为什么不等于每 token 的计算量？ |
| DSpark | 5 个草稿位置、负载滑杆、验证长度 | 投机解码怎样按系统负载动态选择验证长度？ |
| 后训练 | SFT → RL → OPD、reasoning effort | 为什么“算法没变”，能力却提升了？ |

## 内容口径

页面以 DeepSeek 官方 2026-09-10 发布页和 **DeepSeek-V4.1-Flash 技术报告**为主：

- 552B backbone 参数，196B Engram 参数
- 40 层：20 层 Causal Encoder + 20 层 Decoder
- prefill 8B / decode 16B 激活参数
- 最多 1M token 上下文
- global KV 约 890 B/token，约为 V4-Flash 的 1/4，初代 DeepSeek 的 1/437
- persistent KV 约为 V4-Flash 的 1/8
- 45T 多模态预训练 token
- 后训练为 SFT → RL → on-policy distillation，主要增量来自数据与环境

技术报告：<https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/main/DeepSeek_V41_Tech_Report.pdf>

> 这是一个非官方教学项目。页面中的 DSpark 接受率、MoE 路由与 Engram 哈希桶为机制示意，不还原官方权重、tokenizer 或线上吞吐。

## 本地运行

页面是纯静态站点，不需要构建：

```bash
python -m http.server 4173
```

然后打开 <http://127.0.0.1:4173/>。

也可以用任意静态服务器，例如：

```bash
npx serve .
```

## 文件结构

```text
.
├─ index.html          # 页面结构与文案
├─ assets/
│  ├─ styles.css       # 深色技术蓝图视觉与响应式布局
│  ├─ app.js           # Canvas 3D、各机制模拟器与滚动交互
│  ├─ favicon.svg
│  └─ preview.png
├─ .nojekyll           # GitHub Pages 跳过 Jekyll
├─ robots.txt
└─ LICENSE
```

## 实现说明

- 3D 模型图谱使用原生 Canvas 2D 做透视投影，不依赖 Three.js 或 CDN。
- 页面没有运行时网络请求，离线也能打开。
- 支持 `prefers-reduced-motion`、键盘焦点与移动端布局。
- 通过 GitHub Pages 直接从 `main` 分支根目录发布。

## 参考与致谢

- [DeepSeek V4.1 Flash 发布页](https://www.deepseek.com/news/deepseek-v4-1-flash/)
- [DeepSeek-V4.1-Flash 技术报告](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/main/DeepSeek_V41_Tech_Report.pdf)
- [LLM-Visualized](https://www.llm-visualized.com)
- [LLM Visualization](https://bbycroft.net/llm)

## License

代码以 MIT License 发布。页面中的文字、图表与可视化由本项目创作；DeepSeek 名称、模型与论文内容归其各自权利人所有。
