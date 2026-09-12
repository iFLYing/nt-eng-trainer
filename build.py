#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
南通中考英语模拟题库 · 合并 / 校验 / 导出
用法: python3 build.py
读取 papers/paper_*.json -> 合并 papers.json + 校验报告 + 可读 Markdown
"""
import json
import os
import re
import glob

BASE = os.path.dirname(os.path.abspath(__file__))
PAPERS_DIR = os.path.join(BASE, "papers")
OUT_JSON = os.path.join(BASE, "papers.json")
OUT_MD = os.path.join(BASE, "南通中考英语模拟卷_汇总.md")
REPORT = os.path.join(BASE, "校验报告.txt")

SECTION_ORDER = [
    "single_choice", "cloze", "reading", "vocabulary",
    "blank_filling", "task_reading", "writing",
]
SECTION_CN = {
    "single_choice": "单项选择", "cloze": "完形填空", "reading": "阅读理解",
    "vocabulary": "词汇运用", "blank_filling": "短文填空",
    "task_reading": "阅读与回答问题", "writing": "书面表达",
}

# ---- 五维标签体系：题型 / 知识点 / 语篇话题 / 技能 / 难度 ----
# 每套卷对应的语篇话题（基于原创 theme，归一到新课标三大主题语境）
PAPER_TOPIC = {
    1: ["人与社会·传统文化", "人与自我·成长"],
    2: ["人与社会·科技AI", "人与自然·环保"],
    3: ["人与社会·校园", "人与自我·成长"],
    4: ["人与社会·传统文化"],
    5: ["人与自我·健康", "人与自我·成长"],
    6: ["人与社会·传统文化", "人与社会·跨文化交流"],
    7: ["人与自然·动物生态"],
    8: ["人与自我·生活学习"],
    9: ["人与社会·社区", "人与自我·健康"],
    10: ["人与自我·成长", "人与社会·科技"],
}


def map_knowledge(kp):
    """把自由文本的 knowledgePoint 归一为标准知识域。顺序：先特殊后通用。"""
    kp = kp or ""
    rules = [
        ("交际", "情景交际"), ("情景", "情景交际"),
        ("辨析", "词汇辨析"),
        ("短语", "短语搭配"), ("搭配", "短语搭配"),
        ("词形", "词形变换"), ("变换", "词形变换"),
        ("非谓语", "非谓语动词"), ("动名词", "非谓语动词"), ("不定式", "非谓语动词"),
        ("从句", "从句"), ("定语", "从句"), ("状语", "从句"), ("宾语从", "从句"),
        ("情态", "情态动词"),
        ("介词", "介词"),
        ("代词", "代词"),
        ("比较", "形容词副词"), ("形容词", "形容词副词"), ("副词", "形容词副词"),
        ("连词", "连词"),
        ("时态", "时态语态"), ("语态", "时态语态"), ("完成时", "时态语态"),
        ("进行时", "时态语态"), ("过去式", "时态语态"),
        ("填空", "语法填空"), ("无提示", "语法填空"),
        ("逻辑", "语篇逻辑"),
        ("名词", "名词用法"), ("数词", "数词"), ("冠词", "冠词"),
        ("动词", "动词用法"),
    ]
    for kw, val in rules:
        if kw in kp:
            return val
    return "词法基础"


def norm_skill(s):
    s = s or ""
    if "逻辑" in s or "衔接" in s or "结构" in s:
        return "语篇结构"
    for v in ["细节理解", "推理判断", "词义猜测", "主旨大意", "语篇结构"]:
        if v in s:
            return v
    return s or "细节理解"


def skill_for_type(t):
    return {
        "single_choice": "语法运用",
        "vocabulary": "词汇拼写",
        "blank_filling": "语法填空",
        "task_reading": "信息提取",
        "cloze": "语篇逻辑",
    }.get(t, "细节理解")


def tag_paper(paper):
    """给每道题注入五维 tags，供前端专项筛选（题型/知识点/语篇话题/技能/难度）。"""
    topics = PAPER_TOPIC.get(paper.get("paperIndex"), ["通用"])
    for sec in paper["sections"]:
        t = sec["type"]
        qt = SECTION_CN.get(t, t)
        if t == "reading":
            for i, ps in enumerate(sec.get("passages", [])):
                ps_topic = topics[i % len(topics)]
                for q in ps.get("questions", []):
                    q["tags"] = {
                        "questionType": qt,
                        "knowledge": "语篇理解",
                        "topic": ps_topic,
                        "skill": norm_skill(q.get("skill", "")),
                        "difficulty": q.get("difficulty") or 2,
                    }
        elif t == "writing":
            sec["tags"] = {
                "questionType": qt,
                "knowledge": "书面表达",
                "topic": topics[0],
                "skill": "书面表达",
                "difficulty": 3,
            }
        else:
            for q in sec.get("questions", []):
                q["tags"] = {
                    "questionType": qt,
                    "knowledge": map_knowledge(q.get("knowledgePoint", "")),
                    "topic": topics[0] if t == "cloze" else "基础训练",
                    "skill": skill_for_type(t),
                    "difficulty": q.get("difficulty") or 2,
                }


def norm(s):
    return re.sub(r"\s+", "", (s or "").lower())


def q_signature(sec, q, ctx=""):
    """跨卷去重签名。完形/填空用 空位+答案+选项；七选五的选项在 passage 层级，由 ctx 传入；写作用 stem(prompt)。"""
    t = sec["type"]
    if t in ("cloze", "blank_filling"):
        base = (str(q.get("blankLabel", "")) + "|" + str(q.get("answer", "")) +
                "|" + "|".join(q.get("options", []) or []))
        return "cb:" + norm(base)
    if t == "writing":
        return "w:" + norm(q.get("stem") or q.get("prompt") or "")
    base = (str(q.get("stem", "")) + "|" + str(q.get("answer", "")) +
            "|" + ctx + "|" + "|".join(q.get("options", []) or []))
    return norm(base)


def check_question(p, sec, q, ctx, ids, stems, issues):
    qid = q.get("id")
    if qid in ids:
        issues.append(f"重复题号ID: {qid}（{ids[qid]} 与 {p['id']}）")
    ids[qid] = p["id"]
    st = q_signature(sec, q, ctx)
    if st in stems:
        issues.append(f"重复题面: {qid} 与 {stems[st]}")
    stems[st] = qid


def iter_questions(sec):
    t = sec["type"]
    if t == "cloze":
        yield from sec.get("questions", [])
    elif t == "reading":
        for ps in sec.get("passages", []):
            yield from ps.get("questions", [])
    elif t == "writing":
        yield {"id": sec.get("id") or "W",
               "stem": sec.get("prompt", ""),
               "answer": sec.get("referenceVersion", "")}
    else:
        yield from sec.get("questions", [])


def count_questions(paper):
    n = 0
    for sec in paper["sections"]:
        if sec["type"] == "reading":
            for ps in sec.get("passages", []):
                n += len(ps.get("questions", []))
        elif sec["type"] == "writing":
            n += 1
        else:
            n += len(sec.get("questions", []))
    return n


def main():
    files = sorted(glob.glob(os.path.join(PAPERS_DIR, "paper_*.json")))
    if not files:
        print("未找到 papers/paper_*.json")
        return
    papers = []
    for f in files:
        with open(f, encoding="utf-8") as fh:
            papers.append(json.load(fh))
    for p in papers:
        tag_paper(p)

    ids = {}
    stems = {}
    issues = []
    for p in papers:
        sec_types = [s["type"] for s in p["sections"]]
        missing = [t for t in SECTION_ORDER if t not in sec_types]
        if missing:
            issues.append(f"{p['id']} 缺少题型: {missing}")
        for sec in p["sections"]:
            if sec["type"] == "reading":
                for ps in sec.get("passages", []):
                    popts = "|".join(ps.get("options", []) or [])
                    for q in ps.get("questions", []):
                        check_question(p, sec, q, popts, ids, stems, issues)
            else:
                for q in iter_questions(sec):
                    check_question(p, sec, q, "", ids, stems, issues)

    meta = {
        "exam": "南通市中考英语模拟",
        "basedOn": "2025 南通改革结构（满分120，闭卷笔试）",
        "paperCount": len(papers),
        "totalQuestions": sum(count_questions(p) for p in papers),
        "questionTypes": SECTION_ORDER,
        "license": "原创模拟题，仅供教学与训练使用；真实中考试题版权归原出版机构。",
        "generatedAt": "2026-09-12",
    }
    with open(OUT_JSON, "w", encoding="utf-8") as fh:
        json.dump({"meta": meta, "papers": papers}, fh,
                  ensure_ascii=False, indent=2)

    gen_markdown(papers, OUT_MD)
    with open(REPORT, "w", encoding="utf-8") as fh:
        fh.write(f"试卷数: {len(papers)}\n")
        fh.write(f"题目总数: {meta['totalQuestions']}\n")
        fh.write("题号唯一性: " + ("通过" if not any("重复题号" in i for i in issues) else "失败") + "\n")
        fh.write("跨卷题面去重: " + ("通过" if not any("重复题面" in i for i in issues) else "失败") + "\n")
        fh.write("\n校验问题:\n" + ("\n".join(issues) if issues else "无（跨卷ID/题面均无重复，题型齐全）"))

    print(f"OK 合并 {len(papers)} 套，共 {meta['totalQuestions']} 题；问题 {len(issues)} 条")


def gen_markdown(papers, path):
    lines = ["# 南通市中考英语模拟卷（十套·原创）", "",
             "> 按 2025 南通改革结构精简，覆盖全部 7 大题型；原创编写，跨卷无重复。", ""]
    for p in papers:
        lines.append(f"## {p['title']}（主题：{p.get('theme','')}）")
        lines.append("")
        lines.append(f"- 满分：{p.get('totalScore')}　时长：{p.get('durationMinutes')} 分钟")
        lines.append("")
        for sec in p["sections"]:
            lines.append(f"### {SECTION_CN.get(sec['type'], sec['type'])}")
            lines.append("")
            if sec["type"] == "cloze":
                lines.append(sec.get("passage", ""))
                lines.append("")
                for i, q in enumerate(sec["questions"], 1):
                    lines.append(f"{q['id']}. 空 {q.get('blankLabel','')}　答案：**{q['answer']}**　知识点：{q.get('knowledgePoint','')}")
                    lines.append(f"   - 解析：{q.get('analysis','')}")
            elif sec["type"] == "reading":
                for ps in sec.get("passages", []):
                    lines.append(f"**{ps.get('subId')}篇（{ps.get('genre','')}）：{ps.get('title','')}**")
                    lines.append("")
                    lines.append(ps.get("body", ""))
                    lines.append("")
                    if ps.get("options"):
                        lines.append("选项：" + "　".join(ps["options"]))
                        lines.append("")
                    for q in ps.get("questions", []):
                        opt = ""
                        if q.get("options"):
                            opt = "　" + "　".join(q["options"])
                        lines.append(f"{q['id']}. {q.get('stem','')}{opt}　答案：**{q['answer']}**")
                        lines.append(f"   - 解析：{q.get('analysis','')}")
                    lines.append("")
            elif sec["type"] == "writing":
                lines.append(f"**题目：** {sec.get('prompt','')}")
                lines.append("")
                lines.append("要求：" + "；".join(sec.get("requirements", [])))
                lines.append("")
                lines.append(f"参考框架：{sec.get('referenceOutline','')}")
                lines.append("")
                lines.append(f"范文：{sec.get('referenceVersion','')}")
                lines.append("")
                lines.append(f"评分要点：{sec.get('analysis','')}")
                lines.append("")
            else:
                for q in sec.get("questions", []):
                    opt = ""
                    if q.get("options"):
                        opt = "　" + "　".join(q["options"])
                    ans = q.get("answer", "")
                    lines.append(f"{q['id']}. {q.get('stem','')}{opt}　答案：**{ans}**")
                    lines.append(f"   - 解析：{q.get('analysis','')}（知识点：{q.get('knowledgePoint','')}）")
            lines.append("")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


if __name__ == "__main__":
    main()
