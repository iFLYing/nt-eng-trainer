# 南通中考英语模拟题库 · 数据结构设计（Schema）

> 本文档定义面向「交互式英语模拟训练应用（全栈）」的题库数据结构。
> 当前为前期准备阶段产出：原创模拟卷 + 结构化数据 + 合并/去重校验管线。

## 一、命题依据（来自公开检索，2026-09-12）

- **试卷结构（2025 南通改革版，已核实）**：满分 120 分，闭卷笔试 120 分钟。
  - 第Ⅰ卷 选择题 65 分：单项选择 10 题×1；完形填空 15 题×1；阅读理解 20 题×2（含七选五）。
  - 第Ⅱ卷 非选择题 55 分：词汇运用 10 题×1；短文填空 10 题×1；阅读与回答问题 5 题×2；书面表达 25 分。
- **高频考点**：单选 10 类核心点（时态/语态/非谓语/宾语·状语·定语从句/情态动词/介词/代词/形容词副词比较级/连词/情景交际）；完形重动词·名词·形容词·副词辨析与逻辑连词；阅读四类题材（应用文/记叙文/说明文/议论文+七选五）；写作以书信、成长记叙、观点议论为主（约 80 词）。
- **命题趋势**：素养立意、情境化、传统文化与科技（AI/环保）语篇、跨学科融合。

## 二、精简卷配置（本批每套）

为兼顾「全题型覆盖」与「可训练性/可消费性」，每套为真实卷题量的约 2/3，仍覆盖全部 7 大题型，**跨套题面与知识点轮换、无重复**：

| 题型 | 字段 type | 每套题数 | 单题分 | 对应真实卷 |
|---|---|---|---|---|
| 单项选择 | single_choice | 10 | 1 | 10 题 |
| 完形填空 | cloze | 8 | 1 | 15 题（精简） |
| 阅读理解 | reading | 11（A 3 + B 3 + 七选五 5） | 2 | 20 题（精简） |
| 词汇运用 | vocabulary | 6 | 1 | 10 题（精简） |
| 短文填空 | blank_filling | 6 | 1 | 10 题（精简） |
| 阅读与回答问题 | task_reading | 4 | 2 | 5 题（精简） |
| 书面表达 | writing | 1 | 25 | 25 分 |

> 单套约 46 题。后续若要 1:1 还原真实卷，仅需在各 section 的 `questions` 中补足题数，结构无需改动。

## 三、JSON 字段规范（单卷 `paper_XX.json`）

```jsonc
{
  "id": "P01",                       // 试卷唯一ID
  "title": "南通市中考英语模拟试卷（一）",
  "paperIndex": 1,
  "totalScore": 120,
  "durationMinutes": 120,
  "theme": "传统文化与成长",          // 本卷主题，用于轮换/检索
  "structureNote": "按2025结构精简，覆盖全部题型",
  "sections": [
    {
      "type": "single_choice",
      "name": "单项选择",
      "scorePerQuestion": 1,
      "questions": [
        {
          "id": "P01-S01",
          "stem": "题干（英文）",
          "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
          "answer": "A",
          "analysis": "解析（中文，含考点与干扰项说明）",
          "knowledgePoint": "现在完成时",
          "difficulty": 2,            // 1-5
          "topic": "时态"
        }
      ]
    },
    {
      "type": "cloze",
      "name": "完形填空",
      "passage": "原文，空位用 ____(1) ____ 标注",
      "scorePerQuestion": 1,
      "questions": [
        {
          "id": "P01-C01",
          "blankLabel": "(1)",
          "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
          "answer": "C",
          "analysis": "解析",
          "knowledgePoint": "形容词辨析",
          "difficulty": 2,
          "topic": "完形·传统文化"
        }
      ]
    },
    {
      "type": "reading",
      "name": "阅读理解",
      "passages": [
        {
          "subId": "A",
          "genre": "应用文",
          "title": "English Club Recruitment",
          "body": "文章原文",
          "questions": [ { "id":"P01-R-A1", "stem":"...", "options":[...], "answer":"B", "analysis":"...", "skill":"细节理解", "difficulty":2 } ]
        },
        {
          "subId": "C",
          "genre": "七选五",
          "title": "...",
          "body": "文章，空位 ____(1)____",
          "options": ["A. ...","B. ...","C. ...","D. ...","E. ...","F. ..."],
          "questions": [ { "id":"P01-R-C1", "stem":"空位所在句/位置", "answer":"E", "analysis":"...", "skill":"逻辑衔接", "difficulty":3 } ]
        }
      ]
    },
    {
      "type": "vocabulary",
      "name": "词汇运用",
      "scorePerQuestion": 1,
      "questions": [ { "id":"P01-V01", "stem":"句子（括号给出原词）", "answer":"carefully", "analysis":"形容词变副词", "knowledgePoint":"词形变换", "difficulty":2 } ]
    },
    {
      "type": "blank_filling",
      "name": "短文填空",
      "passage": "原文，空位 ____(1)____",
      "scorePerQuestion": 1,
      "questions": [ { "id":"P01-BF01", "blankLabel":"(1)", "answer":"bike", "analysis":"上下文/固定搭配", "knowledgePoint":"名词/无提示", "difficulty":2 } ]
    },
    {
      "type": "task_reading",
      "name": "阅读与回答问题",
      "passage": "短文原文",
      "scorePerQuestion": 2,
      "questions": [ { "id":"P01-T01", "stem":"问题", "answer":"At an old people's home.", "analysis":"细节定位", "skill":"信息提取", "difficulty":2 } ]
    },
    {
      "type": "writing",
      "id": "P01-W",
      "name": "书面表达",
      "score": 25,
      "prompt": "题目",
      "requirements": ["要点1", "要点2"],
      "referenceOutline": "写作要点框架",
      "referenceVersion": "范文（约80词）",
      "analysis": "评分要点与常见失分"
    }
  ]
}
```

## 四、合并与校验（`build.py`）

- 扫描 `papers/paper_*.json`，按文件名排序合并为 `papers.json`（含 `meta` 与 `papers` 数组）。
- 校验：① 题号 `id` 全局唯一；② 题面（去空白/小写归一化）跨卷无重复；③ 每套 7 大题型齐全。
- 输出 `南通中考英语模拟卷_汇总.md`（可读版）与 `校验报告.txt`。

## 五、对接全栈应用的建议

1. **数据层**：`papers.json` 可直接作为种子数据存入数据库（PostgreSQL/MongoDB），或按 `type` 拆表（questions 表 + papers 表 + sections 关联）。
2. **API**：`GET /api/papers`、`GET /api/papers/:id`、`GET /api/questions?type=cloze&difficulty=2`、`POST /api/answers` 判分。
3. **题型渲染**：前端按 `type` 分发组件——`single_choice/cloze/reading/vocabulary/blank_filling/task_reading` 用选择题/填空组件，`writing` 用文本域 + 范文对照。
4. **训练模式**：随机抽取 `n` 题组卷、按 `knowledgePoint`/`difficulty` 错题本、七选五需校验选项集合 `{A..F}`。
5. **扩展性**：`difficulty`、`topic`、`knowledgePoint` 字段支撑自适应推题与学情分析。
