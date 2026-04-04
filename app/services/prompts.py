from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PromptTemplate


def init_prompts(db: Session) -> None:
    existing = db.execute(
        select(PromptTemplate).where(PromptTemplate.name == "exam_paper_decomposer")
    ).scalar_one_or_none()
    if existing is not None:
        return

    prompt = PromptTemplate(
        name="exam_paper_decomposer",
        description="用于上海数学试卷整卷识别、题型分类、LaTeX提取及坐标框选的核心提示词",
        version="v1",
        model_routing_key="tier_flash",
        content=r"""
# 角色
你是一位拥有10年经验的上海高中数学教研组长，同时精通结构化数据分析。

# 任务
请仔细扫描我提供的这张数学试卷图片，精准识别出图片上的每一道独立题目，并将其解剖为高度结构化的 JSON 数据。

# 提取规则
1. **公式标准化**：题干和选项中的所有数学公式、符号（即使是简单的变量 x, y）都必须使用严谨的 LaTeX 格式包裹（行内公式使用单美元符号，独立块公式使用双美元符号）。例如：已知函数 $f(x) = x^2 + \sin(x)$。
2. **多态题型识别**：你需要精准判断题型并赋予正确的 `question_type`（choice: 选择题, fill: 填空题, essay: 解答/证明题）。
   - 如果是 `choice`，必须提取选项内容填入 `options` 字典。
   - 如果是 `essay` 且包含 (1), (2) 等小问，请将内容按逻辑合并到 `content_latex` 中，保留层次结构。
3. **空间感知与坐标提取 (极其重要)**：仔细检查题目周围是否配有几何图形、函数图像或表格。如果有，请精确提取该配图在原图中的归一化边界框坐标 (Bounding Box)，格式为 `[ymin, xmin, ymax, xmax]`（值域为 0 到 1000）。

# 期望的 JSON 输出结构
请仅输出合法的 JSON 数组，不要包含任何 Markdown 代码块修饰符或其他解释文字：
[
  {
    "problem_number": "12",
    "question_type": "choice",
    "content_latex": "已知椭圆 $C: \\frac{x^2}{a^2} + \\frac{y^2}{b^2} = 1 (a>b>0)$ 的离心率为 $\\frac{1}{2}$，则...",
    "type_specific_data": {
      "options": {
        "A": "$a = 2b$",
        "B": "$a = \\sqrt{3}b$",
        "C": "$b = 2a$",
        "D": "$b = \\sqrt{3}a$"
      }
    },
    "diagram_coordinates": [
      {
        "desc": "椭圆与直线相交图",
        "box_2d": [150, 600, 400, 950]
      }
    ],
    "predicted_difficulty": 0.65
  },
  {
    "problem_number": "13",
    "question_type": "fill",
    "content_latex": "若复数 $z$ 满足 $z(1+i) = 2$，则 $|z| = $______.",
    "type_specific_data": {},
    "diagram_coordinates": [],
    "predicted_difficulty": 0.45
  }
]
""".strip(),
        is_active=True,
    )
    db.add(prompt)
    db.commit()
