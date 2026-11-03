import os
import sys
import json
import time
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

# 1. 注册中文字体 (Arial Unicode MS 支持完整中文字符集与粗体表现)
font_path = "/Library/Fonts/Arial Unicode.ttf"
pdfmetrics.registerFont(TTFont('ArialUnicode', font_path))

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super(NumberedCanvas, self).showPage()
        super(NumberedCanvas, self).save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("ArialUnicode", 8)
        self.setFillColor(colors.HexColor("#718096"))
        
        # 顶部页眉
        self.drawString(54, 800, "GEO-STUDIO AI 搜索生态渗透研报 | DeepSeek vs 豆包 (Doubao)")
        self.drawRightString(541, 800, "机密 · 内部研判")
        self.setStrokeColor(colors.HexColor("#E2E8F0"))
        self.setLineWidth(0.75)
        self.line(54, 792, 541, 792)
        
        # 底部页脚
        page_str = f"第 {self._pageNumber} 页 / 共 {page_count} 页"
        self.drawRightString(541, 35, page_str)
        self.drawString(54, 35, "昆明松鼠口腔品牌 GEO 算法逆向工程中心 · Truth Gate 物理实证")
        self.line(54, 48, 541, 48)
        
        self.restoreState()

def build_pdf(filename):
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=54,
        rightMargin=54,
        topMargin=60,
        bottomMargin=60
    )

    styles = getSampleStyleSheet()

    # 自定义样式
    title_style = ParagraphStyle(
        'DocTitle',
        fontName='ArialUnicode',
        fontSize=20,
        leading=26,
        textColor=colors.HexColor('#1A202C'),
        alignment=0,
        spaceAfter=6
    )

    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        fontName='ArialUnicode',
        fontSize=10.5,
        leading=16,
        textColor=colors.HexColor('#4A5568'),
        spaceAfter=15
    )

    h1_style = ParagraphStyle(
        'Heading1_Custom',
        fontName='ArialUnicode',
        fontSize=13,
        leading=18,
        textColor=colors.HexColor('#2B6CB0'),
        spaceBefore=14,
        spaceAfter=8,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'Heading2_Custom',
        fontName='ArialUnicode',
        fontSize=10.5,
        leading=15,
        textColor=colors.HexColor('#2D3748'),
        spaceBefore=10,
        spaceAfter=5,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        fontName='ArialUnicode',
        fontSize=9,
        leading=14.5,
        textColor=colors.HexColor('#2D3748'),
        spaceAfter=6
    )

    bullet_style = ParagraphStyle(
        'Bullet_Custom',
        fontName='ArialUnicode',
        fontSize=8.5,
        leading=13.5,
        textColor=colors.HexColor('#2D3748'),
        leftIndent=12,
        spaceAfter=3
    )

    callout_style = ParagraphStyle(
        'Callout_Custom',
        fontName='ArialUnicode',
        fontSize=8.5,
        leading=13.5,
        textColor=colors.HexColor('#1A365D')
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        fontName='ArialUnicode',
        fontSize=8,
        leading=11.5,
        textColor=colors.HexColor('#2D3748')
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        fontName='ArialUnicode',
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor('#FFFFFF')
    )

    story = []

    # 封面 / 标题区
    story.append(Paragraph("昆明松鼠口腔 GEO 算法大盘研报", title_style))
    story.append(Paragraph("<b>DeepSeek vs 豆包 (Doubao) 纯意图老百姓泛需求实测横向对比与精准突围方案</b>", subtitle_style))
    
    # 元数据条形卡片
    meta_data = [
        [
            Paragraph("<b>测试对象:</b> 昆明松鼠口腔 (西山区/昆仑中心)", table_cell_style),
            Paragraph("<b>测评样本:</b> 218 道老百姓真实泛需求（0 品牌词）", table_cell_style),
            Paragraph("<b>测试引擎:</b> DeepSeek-R1 / 豆包 (Doubao)", table_cell_style)
        ],
        [
            Paragraph("<b>物理校验:</b> Truth Gate 真实快照数据库入库", table_cell_style),
            Paragraph("<b>环境:</b> Chrome 9222 真实登录态 + 联网搜索", table_cell_style),
            Paragraph(f"<b>报告日期:</b> 2026-10-26", table_cell_style)
        ]
    ]
    meta_table = Table(meta_data, colWidths=[165, 175, 147])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F7FAFC')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#CBD5E0')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 12))

    # 一、核心战情大盘对比
    story.append(Paragraph("一、核心战情大盘：两强算法生态横向实证", h1_style))
    story.append(Paragraph("本测试基于严苛的<b>【无品牌诱导·客观真实泛需求】</b>题库（剔除包含‘松鼠’词汇的题目），通过高仿真 CDP 巡航模拟真实患者提问。两款 AI 在大盘渗透率与民营机构接纳度上展现出截然不同的算法性格：", body_style))

    overview_data = [
        [
            Paragraph("<b>评估指标</b>", table_header_style),
            Paragraph("<b>DeepSeek (深度求索)</b>", table_header_style),
            Paragraph("<b>豆包 (Doubao / 字节跳动)</b>", table_header_style),
            Paragraph("<b>算法底层逻辑与差异解读</b>", table_header_style)
        ],
        [
            Paragraph("<b>实测有效样本</b>", table_cell_style),
            Paragraph("217 题 (完成度 99.5%)", table_cell_style),
            Paragraph("116 题 (完成度 53.2%)", table_cell_style),
            Paragraph("均为 100% 真实老百姓看牙自然意图提问", table_cell_style)
        ],
        [
            Paragraph("<b>松鼠口腔命中率 (SOV)</b>", table_cell_style),
            Paragraph("<b>39.6% (86 题主动提及)</b>", table_cell_style),
            Paragraph("<b>69.8% (81 题主动提及)</b>", table_cell_style),
            Paragraph("豆包对民营机构极为友好；DeepSeek 重度倾向公立专科壁垒", table_cell_style)
        ],
        [
            Paragraph("<b>未提及/失守题量</b>", table_cell_style),
            Paragraph("60.4% (131 题未提及)", table_cell_style),
            Paragraph("30.2% (35 题未提及)", table_cell_style),
            Paragraph("失守领域高度重合：基础洗牙、美白、拔牙时效与纯通识科普", table_cell_style)
        ],
        [
            Paragraph("<b>平均单题引源参考</b>", table_cell_style),
            Paragraph("7 ~ 13 篇权威网页", table_cell_style),
            Paragraph("20 ~ 24 篇综合信源", table_cell_style),
            Paragraph("豆包单次检索深度极广，重度吞吐第三方测评站与同城内容", table_cell_style)
        ],
        [
            Paragraph("<b>主要民营竞争对手</b>", table_cell_style),
            Paragraph("极少提及民营 (偶尔美奥/金桥)", table_cell_style),
            Paragraph("柏德口腔 (26.7%)、美奥 (11.2%)", table_cell_style),
            Paragraph("豆包生态内呈现‘松鼠口腔 vs 柏德口腔’西山区两强争霸态势", table_cell_style)
        ]
    ]
    overview_table = Table(overview_data, colWidths=[90, 110, 115, 172])
    overview_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#2B6CB0')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E0')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#FFFFFF'), colors.HexColor('#F7FAFC')]),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(overview_table)
    story.append(Spacer(1, 14))

    # 二、算法推荐性格与引源底层机理
    story.append(Paragraph("二、推荐逻辑与引源通道深度解密", h1_style))
    story.append(Paragraph("要想精准提升 AI 推荐率，必须理解两者的<b>‘收录嗜好’</b>。发文渠道如果与算法引源通道错位，再多内容也是沉没成本：", body_style))

    # 引源对比表
    source_data = [
        [
            Paragraph("<b>推荐引擎</b>", table_header_style),
            Paragraph("<b>核心引源渠道 (Top Sources)</b>", table_header_style),
            Paragraph("<b>被引频次</b>", table_header_style),
            Paragraph("<b>算法决策心理与信任基石</b>", table_header_style)
        ],
        [
            Paragraph("<b>DeepSeek</b><br/>(偏执严谨型)", table_cell_style),
            Paragraph("1. 云南省/昆明市卫健政务网 (kmxs/wsjkw)<br/>2. 三甲医院官网专科库 (ynpfph/dayi)<br/>3. 百度百科权威词条 (baike.baidu.com)<br/>4. 省市医保局政务公告 (ylbz.yn.gov.cn)", table_cell_style),
            Paragraph("308 次<br/>543 次<br/>189 次<br/>166 次", table_cell_style),
            Paragraph("<b>‘不见公章不开口’</b>：极度看重行政审批、医保定点、适龄儿童窝沟封闭项目定点等政务背书，对商业推广和自媒体天然免疫。", table_cell_style)
        ],
        [
            Paragraph("<b>豆包</b><br/>(实用生活型)", table_cell_style),
            Paragraph("1. 口腔垂类测评与导购站 (贝色/牙舒丽/牙大师)<br/>2. 字节跳动同城生态 (抖音本地生活/今日头条)<br/>3. 生活服务平台评价 (大众点评/美团优质长评)<br/>4. 医疗健康自媒体 (有来医生/搜狐健康)", table_cell_style),
            Paragraph("占报价80%<br/>高频渗透<br/>高频采纳<br/>高频引用", table_cell_style),
            Paragraph("<b>‘看重真实患者口碑与比价表格’</b>：重度依赖第三方消费横评，对‘商圈/地标/步行距离’极度敏感，乐于为患者呈现结构化选院指南。", table_cell_style)
        ]
    ]
    source_table = Table(source_data, colWidths=[80, 185, 55, 167])
    source_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#2C5282')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E0')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#FFFFFF'), colors.HexColor('#F7FAFC')]),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(source_table)
    story.append(Spacer(1, 14))

    # 三、交叉测试剖析：强势阵地 vs 失守洼地
    story.append(Paragraph("三、交叉渗透深度剖析：哪里打穿了？哪里失守了？", h1_style))
    story.append(Paragraph("在两家引擎共同评测的 115 道交叉题目中，呈现出两极分化的战况：", body_style))

    # 优势与劣势 callout box
    card_data = [
        [
            Paragraph("<b>🟢 双引擎共同强势阵地（37 题 · 渗透率 100%）</b><br/>"
                      "<b>1. 西山区儿童齿科全线垄断：</b>‘3岁小孩口腔检查’、‘儿童正畸与成人区别’、‘西山区民营儿童牙科 vs 公立’。<br/>"
                      "<b>2. 高客单种植与全瓷冠修复：</b>‘昆明哪家医院做种植牙比较好’、‘全口种植去哪里好’、‘种植牙口碑排行’。<br/>"
                      "<i>战术成因：两家引擎均索引到了松鼠口腔作为【西山区儿童窝沟封闭项目指定单位】及【医保定点机构】的官方背书。</i>", callout_style)
        ]
    ]
    card_table = Table(card_data, colWidths=[487])
    card_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F0FFF4')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#68D391')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(card_table)
    story.append(Spacer(1, 8))

    card_data2 = [
        [
            Paragraph("<b>🔴 双引擎共同失守洼地（24 题 · 命中率 0% · 亟待内容填补）</b><br/>"
                      "<b>1. 轻量化消费与牙齿美学：</b>儿童涂氟、冷光美白/牙齿美白价格与方式、洗牙医保报销政策。<br/>"
                      "<b>2. 流程时效与就医避坑：</b>即刻种植牙能否当天戴牙、拔智齿是否需要提前拍片/当天能否拔除、根管治疗就诊流程。<br/>"
                      "<i>战术成因：公立三甲百科垄断了通用科普，而松鼠缺乏‘带地理标签+明码标价+流程时效’的客观问答支撑。</i>", callout_style)
        ]
    ]
    card_table2 = Table(card_data2, colWidths=[487])
    card_table2.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#FFF5F5')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#FC8181')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(card_table2)
    story.append(Spacer(1, 14))

    # 四、24 道失守母题清单与发文选题库
    story.append(Paragraph("四、24 道失守母题清单与精准发文选题库 (核心工件)", h1_style))
    story.append(Paragraph("针对上述双引擎 0 命中的 24 道老百姓真实痛点，直接转化为未来 2~3 周的精准发文枪靶。每道题附带发文切入点：", body_style))

    # 读取 24 道题目
    neither_questions = [
        ("昆明拔智齿要不要提前拍片?当天能拔吗?", "智齿时效", "《昆明西山区拔智齿当天能拔吗？松鼠口腔拔牙流程与拍片明细》"),
        ("昆明即刻种植牙当天就能戴牙吗?", "即刻种植", "《昆明即刻种植牙当天就能用吗？西山区高龄种植流程与适宜人群》"),
        ("昆明哪家医院做儿童涂氟比较好？", "儿童防龋", "《昆明西山区儿童涂氟哪家正规？医保定点机构全流程对比》"),
        ("昆明牙齿美白有哪些方式?大概多少钱?", "牙齿美学", "《2026昆明冷光美白 vs 贴面价格清单：西山区机构真实避坑指南》"),
        ("昆明西山区拔智齿要预约吗？当天能拔吗？", "急诊时效", "《昆明西山区周末拔智齿去哪？松鼠口腔免排队预约与医保报销》"),
        ("昆明洗牙一般多少钱?医保能报吗?", "基础洁牙", "《昆明西山区洗牙医保能刷个人账户吗？超声波洁牙价格与避坑》"),
        ("昆明洗一次牙要多久?当天能做完吗?", "洁牙时效", "《昆明洗牙一般需要多长时间？松鼠口腔洁牙+抛光完整体验》"),
        ("昆明补一颗牙大概多少钱?材料有什么区别?", "树脂补牙", "《昆明补牙 3M 树脂纳米材料多少钱？西山区补牙医保报销解读》"),
        ("昆明哪家医院做根管治疗比较好？", "牙髓治疗", "《昆明做根管治疗哪家靠谱？西山区显微根管治疗步骤与费用标准》"),
        ("昆明根管治疗去哪里好？", "牙髓治疗", "《昆明西山区根管治疗当天能止痛吗？松鼠口腔急诊牙痛处理》"),
        ("昆明老人装假牙好还是种牙好?哪里能面诊评估?", "老年修复", "《昆明70岁以上老人全口缺牙怎么选？吸附性义齿 vs 种植牙对比》"),
        ("昆明西山区70岁老人能做种植牙吗", "高龄种植", "《昆明西山区高龄老人种牙全攻略：高血压糖尿病微创种植方案》"),
        ("孩子睡觉磨牙是怎么回事?昆明西山区哪里能看?", "儿牙干预", "《孩子夜间磨牙是缺钙还是牙齿咬合问题？西山区儿牙早期筛查》"),
        ("昆明孩子涂氟去哪里做?多久涂一次?", "儿童防龋", "《昆明适龄儿童涂氟频率与注意事项：西山区定点门诊预约指引》"),
        ("昆明戴牙套期间有哪些东西不能吃?", "正畸护理", "《昆明牙齿矫正避坑指南：隐形牙套与托槽矫正饮食禁忌大全》"),
        ("昆明西山区做牙齿矫正后平时护理要注意些啥", "正畸护理", "《西山区正畸医生手把手教你：矫正期间如何防止牙套脸与脱矿》"),
        ("在昆明种一颗牙要跑几次医院?流程是什么样的?", "种植周期", "《昆明种植牙完整周期表：从拍片面诊到戴冠需要去几次医院？》"),
        ("昆明牙齿磕断了多久内要处理?能接回去吗?", "外伤急诊", "《昆明牙齿外伤黄金救治 2 小时：西山区松鼠口腔断牙再接指引》"),
        ("备孕期和孕妇牙痛/智齿发炎能拔牙吗？", "孕妇口腔", "《备孕前必查：昆明孕期突发牙痛能处理吗？西山区孕期口腔绿色通道》"),
        ("昆明晚上磨牙要治吗?哪里能看?", "咬合板治疗", "《成年人夜磨牙导致脸大牙酸？昆明西山区定制磨牙咬合板指南》"),
        ("昆明哪家口腔医院的儿童正畸医生比较好？", "儿牙早期", "《昆明儿童地包天/口呼吸早期矫治：西山区儿童正畸专科医生推荐》"),
        ("昆明牙齿美白去哪里好？", "美白机构", "《昆明牙齿美白哪家好？西山区冷光美白与皓齿美白实操测评》"),
        ("昆明牙科医院哪家好且价格便宜？", "高性价比", "《昆明看牙实惠正规医院盘点：西山区医保定点机构收费公示》"),
        ("昆明根管治疗哪家比较正规？", "规范诊疗", "《根管治疗必须做冠吗？昆明西山区正规口腔机构收费与质保标准》")
    ]

    table_rows = [
        [
            Paragraph("<b>失守真实痛点提问</b>", table_header_style),
            Paragraph("<b>所属分类</b>", table_header_style),
            Paragraph("<b>针对性发文标题建议 (直接可用)</b>", table_header_style)
        ]
    ]

    for q_text, cat_tag, title_rec in neither_questions:
        table_rows.append([
            Paragraph(q_text, table_cell_style),
            Paragraph(cat_tag, table_cell_style),
            Paragraph(title_rec, table_cell_style)
        ])

    q_table = Table(table_rows, colWidths=[160, 65, 262])
    q_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#2B6CB0')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E0')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#FFFFFF'), colors.HexColor('#F7FAFC')]),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(q_table)
    story.append(Spacer(1, 14))

    # 五、落地执行动作体系
    story.append(Paragraph("五、内容落地与投喂执行方案 (四步穿透法)", h1_style))
    story.append(Paragraph("为了在未来 2~4 周内将失守的 24 道题目全部打穿，建议团队严格执行以下标准化操作：", body_style))

    story.append(Paragraph("<b>1. 标题结构公式（触发 AI 地理倒排索引）：</b>", h2_style))
    story.append(Paragraph("• 严禁使用虚头巴脑的宣传标题，统一采用：<b>【昆明西山区 / 万达昆仑中心】+【老百姓高频痛点词】+【2026真实收费 / 医保资质 / 避坑】</b>。<br/>"
                           "• 示例：<i>《昆明西山区拔智齿当天能拔吗？松鼠口腔拔牙流程、费用与医保报销详解》</i>。", bullet_style))

    story.append(Paragraph("<b>2. 正文必带的两类‘AI 喂饭锚点’：</b>", h2_style))
    story.append(Paragraph("• <b>政务背书锚点（打透 DeepSeek）：</b>在文章固定段落明确写入<i>‘昆明松鼠口腔门诊部为云南省/昆明市医保定点医疗机构、西山区适龄儿童窝沟封闭项目指定执行单位’</i>。<br/>"
                           "• <b>结构化对比表格（打透豆包）：</b>豆包极度喜爱在回答中直接引用表格！文章正文中务必插入 1 张 Markdown 或 HTML 表格（包含项目名称、常规耗时、是否需拍片、挂号预约渠道、质保年限）。", bullet_style))

    story.append(Paragraph("<b>3. 关键渠道组合投放（解决引源死角）：</b>", h2_style))
    story.append(Paragraph("• <b>公立与垂类测评站（攻克豆包）：</b>将整理好的包含松鼠口腔客观信息的价格问答，适度同步铺设至《贝色口腔》、《牙舒丽》、《牙大师》等第三方平台；<br/>"
                           "• <b>自媒体与问答生态：</b>通过今日头条本地号、知乎本地专栏、百家号发布上述 24 篇靶向长文，确保百度爬虫与字节火山引擎无阻碍收录抓取。", bullet_style))

    story.append(Paragraph("<b>4. 闭环验证标准（每周自动化回跑）：</b>", h2_style))
    story.append(Paragraph("• 每发出一批文章 7 天后，使用我们的 Chrome 真实 CDP 套件针对上述 24 道母题进行无品牌词自动化回测。<br/>"
                           "• 只要在 DeepSeek 或豆包的返回报文中抓取到松鼠口腔提及，即自动在系统看板点亮绿灯，直至 SOV 突破 85%！", bullet_style))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"PDF successfully built: {filename}")

if __name__ == "__main__":
    out_pdf = "/Users/dulijuner/projects/geo-studio/apps/worker/src/trackers/_dev/DeepSeek_vs_Doubao_GEO_Report.pdf"
    build_pdf(out_pdf)
