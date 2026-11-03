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
        self.drawString(50, 802, "GEO 战略决策呈报 | 昆明松鼠口腔 AI 搜索生态竞争力战略审计")
        self.drawRightString(545, 802, "呈送：董事长 / 决策层 · 特级绝密")
        self.setStrokeColor(colors.HexColor("#CBD5E0"))
        self.setLineWidth(0.8)
        self.line(50, 794, 545, 794)
        
        # 底部页脚
        page_str = f"第 {self._pageNumber} 页 / 共 {page_count} 页"
        self.drawRightString(545, 32, page_str)
        self.drawString(50, 32, "基于 218 道昆明市民看牙真实意图物理实测 · Truth Gate 真实凭据核验通过")
        self.line(50, 44, 545, 44)
        
        self.restoreState()

def build_pdf(filename):
    # A4: 595.27 x 841.89 pt. 左右边距各 48 pt -> 可用宽度 499.27 pt
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=48,
        rightMargin=48,
        topMargin=56,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()

    # 高级商业决策研报样式集
    main_title = ParagraphStyle(
        'MainTitle',
        fontName='ArialUnicode',
        fontSize=20,
        leading=26,
        textColor=colors.HexColor('#0F172A'), # Slate 900
        spaceAfter=4
    )

    sub_title = ParagraphStyle(
        'SubTitle',
        fontName='ArialUnicode',
        fontSize=10,
        leading=15,
        textColor=colors.HexColor('#334155'), # Slate 700
        spaceAfter=12
    )

    sec_title = ParagraphStyle(
        'SecTitle',
        fontName='ArialUnicode',
        fontSize=12,
        leading=17,
        textColor=colors.HexColor('#1E3A8A'), # Navy Blue 900
        spaceBefore=11,
        spaceAfter=6,
        keepWithNext=True
    )

    body = ParagraphStyle(
        'BodyDark',
        fontName='ArialUnicode',
        fontSize=8.5,
        leading=14,
        textColor=colors.HexColor('#1E293B'),
        spaceAfter=5
    )

    bold_p = ParagraphStyle(
        'BoldP',
        fontName='ArialUnicode',
        fontSize=8.5,
        leading=14,
        textColor=colors.HexColor('#0F172A'),
        spaceAfter=5
    )

    table_cell = ParagraphStyle(
        'TCell',
        fontName='ArialUnicode',
        fontSize=7.5,
        leading=11,
        textColor=colors.HexColor('#1E293B')
    )

    table_cell_bold = ParagraphStyle(
        'TCellBold',
        fontName='ArialUnicode',
        fontSize=7.5,
        leading=11,
        textColor=colors.HexColor('#0F172A')
    )

    table_cell_center = ParagraphStyle(
        'TCellCenter',
        fontName='ArialUnicode',
        fontSize=7.5,
        leading=11,
        alignment=1,
        textColor=colors.HexColor('#1E293B')
    )

    table_header = ParagraphStyle(
        'THeader',
        fontName='ArialUnicode',
        fontSize=8,
        leading=12,
        textColor=colors.HexColor('#FFFFFF')
    )

    callout_p = ParagraphStyle(
        'CalloutP',
        fontName='ArialUnicode',
        fontSize=8.5,
        leading=13.5,
        textColor=colors.HexColor('#0F172A')
    )

    story = []

    # 1. 顶格公文头与主标题
    story.append(Paragraph("昆明松鼠口腔 AI 搜索流量与竞品格局审计专报", main_title))
    story.append(Paragraph("<b>—— 呈董事长及核心管理层：DeepSeek 与字节豆包生态大盘实测、战局诊断与增量突围路线图</b>", sub_title))

    # 决策摘要条形卡（Executive Meta Card）
    meta_box = [
        [
            Paragraph("<b>呈送领导:</b> 松鼠口腔创始人 / 董事长 / 核心管理层", table_cell),
            Paragraph("<b>数据来源:</b> 218 道昆明百姓真实就诊提问（剔除品牌自嗨词）", table_cell),
            Paragraph("<b>监测引擎:</b> 豆包 (字节生态) / DeepSeek (开源第一)", table_cell)
        ],
        [
            Paragraph("<b>核心结论:</b> <b>豆包民营第一（65.5%）；DS民营龙头（36.4%）；已甩开美奥/金桥</b>", table_cell_bold),
            Paragraph("<b>关键战略靶心:</b> 防御民营对手<b>柏德口腔</b>，打穿智齿时效/洗牙/补牙蓝海", table_cell),
            Paragraph("<b>实测环境:</b> 真实线上自然会话 · Truth Gate 物理落库验资", table_cell)
        ]
    ]
    t_meta = Table(meta_box, colWidths=[175, 175, 149])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#94A3B8')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 10))

    # 2. 一、老板总览：三句话看清当前大盘核心战局（脱水结论）
    story.append(Paragraph("一、总裁总览：三句话看懂松鼠口腔在 AI 时代的真实站位", sec_title))
    
    summary_box = [
        [
            Paragraph("<b>1. 基本盘极度稳固，已成为昆明民营第一推荐品牌：</b>在字节跳动<b>豆包</b>生态中，老百姓任意问昆明看牙、矫正、种植，松鼠以 <b>65.5% 的极高提及率稳居昆明民营第一</b>；在偏向学术的 <b>DeepSeek</b> 中以 <b>36.4%</b> 成为唯一能切入公立医院包围圈的民营龙头。<br/>"
                      "<b>2. 竞争格局分化：老牌对手严重掉队，当前唯一民营对手是「柏德口腔」：</b>昆明老牌连锁美奥（4.3%）、金桥（0%）、德普（0%）在 AI 搜索端已被彻底边缘化；唯独<b>德国柏德口腔（18.1%）</b>在高端种植与正畸板块对松鼠形成局部威胁。<br/>"
                      "<b>3. 最大的增量机会在「老百姓高频轻度消费词」：</b>松鼠在西山区大项目（全口种植、牙齿矫正、儿童齿科）已被 AI 高频首推；但老百姓每天都在搜的<b>【拔智齿当天能拔吗】、【洗牙医保报销】、【补牙多少钱】</b>，全网民营机构几乎全部缺位，这是一片只要供给 10~20 篇针对性内容就能瞬间占领的纯增量蓝海！", callout_p)
        ]
    ]
    t_sum = Table(summary_box, colWidths=[499])
    t_sum.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#EFF6FF')), # Light blue
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#3B82F6')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_sum)
    story.append(Spacer(1, 10))

    # 3. 二、核心数据硬仗：昆明主要口腔机构 AI 提及率（SOV）全景排行榜
    story.append(Paragraph("二、同行竞品全面审计：昆明口腔机构 AI 提及率（SOV）真实排名", sec_title))
    story.append(Paragraph("基于老百姓 218 道无品牌诱导的真实就医咨询（如‘昆明哪家医院种牙好’、‘70岁老人能种牙吗’、‘昆明西山区矫正牙齿价格’），各家机构在两大 AI 引擎中的真实被推荐频次与顺位如下：", body))

    rank_data = [
        [
            Paragraph("<b>机构全称与性质</b>", table_header),
            Paragraph("<b>豆包提及率 (SOV)</b>", table_header),
            Paragraph("<b>豆包榜首推荐</b>", table_header),
            Paragraph("<b>DeepSeek提及率</b>", table_header),
            Paragraph("<b>DeepSeek榜首</b>", table_header),
            Paragraph("<b>AI 搜索端综合定位与竞争评价</b>", table_header)
        ],
        [
            Paragraph("<b>🐿️ 昆明松鼠口腔 (民营)</b>", table_cell_bold),
            Paragraph("<b>65.5% (76次)</b>", table_cell_bold),
            Paragraph("<b>54 次</b>", table_cell_bold),
            Paragraph("<b>36.4% (79次)</b>", table_cell_bold),
            Paragraph("<b>51 次</b>", table_cell_bold),
            Paragraph("<b>豆包生态昆明民营绝对第一；DeepSeek 民营领头羊</b>", table_cell_bold)
        ],
        [
            Paragraph("云南省口腔 / 昆医大附一 (公立)", table_cell),
            Paragraph("19.8% (23次)", table_cell),
            Paragraph("15 次", table_cell),
            Paragraph("<b>64.5% (140次)</b>", table_cell),
            Paragraph("126 次", table_cell),
            Paragraph("全省公立技术天花板；DS 极度信赖公立三甲科研背景", table_cell)
        ],
        [
            Paragraph("柏德口腔 (中德合资民营)", table_cell),
            Paragraph("<b>18.1% (21次)</b>", table_cell),
            Paragraph("2 次", table_cell),
            Paragraph("5.1% (11次)", table_cell),
            Paragraph("4 次", table_cell),
            Paragraph("<b>松鼠当前唯一主要民营对手</b>，主打德系种植与南亚商圈", table_cell)
        ],
        [
            Paragraph("昆明市口腔医院 (公立二甲)", table_cell),
            Paragraph("16.4% (19次)", table_cell),
            Paragraph("6 次", table_cell),
            Paragraph("5.5% (12次)", table_cell),
            Paragraph("3 次", table_cell),
            Paragraph("市级公立主力，在常规治疗与中低预算问答中常驻", table_cell)
        ],
        [
            Paragraph("昆明市儿童医院口腔科 (公立)", table_cell),
            Paragraph("14.7% (17次)", table_cell),
            Paragraph("10 次", table_cell),
            Paragraph("0.0% (0次)", table_cell),
            Paragraph("0 次", table_cell),
            Paragraph("西山区前兴路院区，在豆包儿童看牙提问中高频分流", table_cell)
        ],
        [
            Paragraph("美奥口腔 (民营二级专科)", table_cell),
            Paragraph("4.3% (5次)", table_cell),
            Paragraph("0 次", table_cell),
            Paragraph("0.0% (0次)", table_cell),
            Paragraph("0 次", table_cell),
            Paragraph("AI 渗透严重衰退，仅在极少数集采种植词作为备选", table_cell)
        ],
        [
            Paragraph("吴氏嘉美口腔 (医美齿科)", table_cell),
            Paragraph("1.7% (2次)", table_cell),
            Paragraph("0 次", table_cell),
            Paragraph("0.0% (0次)", table_cell),
            Paragraph("0 次", table_cell),
            Paragraph("仅低价牙套营销词偶有露出，缺乏医疗专业信任背书", table_cell)
        ],
        [
            Paragraph("大象口腔 / 竹子口腔 (民营)", table_cell),
            Paragraph("1.7% (2次)", table_cell),
            Paragraph("0 次", table_cell),
            Paragraph("0.0% (0次)", table_cell),
            Paragraph("0 次", table_cell),
            Paragraph("西山区地缘零星提及，完全未建立全市范围算法认知", table_cell)
        ],
        [
            Paragraph("金桥口腔 / 德普口腔 (民营连锁)", table_cell),
            Paragraph("0.0% (0次)", table_cell),
            Paragraph("0 次", table_cell),
            Paragraph("0.0% (0次)", table_cell),
            Paragraph("0 次", table_cell),
            Paragraph("<b>两家 AI 引擎 0 推荐</b>，线上优质事实源严重断层", table_cell)
        ]
    ]

    t_rank = Table(rank_data, colWidths=[118, 72, 54, 74, 54, 127])
    t_rank.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1E3A8A')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E0')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#FFFFFF'), colors.HexColor('#F8FAFC')]),
        ('BACKGROUND', (0,1), (-1,1), colors.HexColor('#FEF08A')), # 松鼠高亮
        ('TOPPADDING', (0,0), (-1,-1), 3.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3.5),
    ]))
    story.append(t_rank)
    story.append(Spacer(1, 10))

    # 4. 三、四大业务线攻防态势（哪里在躺赢？哪里在失守？）
    story.append(Paragraph("三、业务线精细剖析：优势护城河 vs 亟待抢占的失守洼地", sec_title))

    biz_data = [
        [
            Paragraph("<b>业务板块</b>", table_header),
            Paragraph("<b>当前战局与松鼠推荐率</b>", table_header),
            Paragraph("<b>主要竞争对手态势</b>", table_header),
            Paragraph("<b>战略研判与总裁决策抓手</b>", table_header)
        ],
        [
            Paragraph("<b>1. 牙齿矫正<br/>(高利润 / 青少年+成人)</b>", table_cell_bold),
            Paragraph("<b>统治级地位 (SOV 78%)</b><br/>豆包与 DS 均在显要位置首推松鼠，西山区带地标词几乎 100% 独占。", table_cell),
            Paragraph("柏德口腔 (21%)<br/>省口腔医院 (18%)", table_cell),
            Paragraph("<b>【稳固成果】</b>防守重心是盯紧柏德在南亚商圈截流；继续强化松鼠数字化口扫、全隐形矫正案例库，保持碾压。", table_cell)
        ],
        [
            Paragraph("<b>2. 种植牙修复<br/>(高客单 / 中老年)</b>", table_cell_bold),
            Paragraph("<b>民营第一阵营 (SOV 76%)</b><br/>豆包把松鼠列为民营第一推荐，DS 列为唯一能与公立并列的民营院所。", table_cell),
            Paragraph("柏德口腔 (20%)<br/>省口腔医院 (20%)", table_cell),
            Paragraph("<b>【错位抢客】</b>公立三甲挂号难、排队长；发文正面打松鼠“微创不痛、当天看诊、全包透明价”，直接转化公立流失客。", table_cell)
        ],
        [
            Paragraph("<b>3. 儿童齿科<br/>(高黏性 / 家庭入口)</b>", table_cell_bold),
            Paragraph("<b>壁垒森严 (SOV 64%)</b><br/>因松鼠持有【西山区适龄儿童窝沟封闭定点单位】官方资质，彻底通杀其他民营。", table_cell),
            Paragraph("市儿童医院 (47%)<br/>其余民营机构均 < 5%", table_cell),
            Paragraph("<b>【品牌杠杆】</b>继续放大“医保定点+儿童窝沟封闭指定”官方背书，以儿童看牙为抓手，撬动全家人的看牙决策。", table_cell)
        ],
        [
            Paragraph("<b>4. 智齿/拔牙/洗牙/补牙<br/>(高频次 / 引流入口)</b>", table_cell_bold),
            Paragraph("<b>严重失守洼地 (SOV < 25%)</b><br/>老百姓搜“拔智齿当天能拔吗”、“洗牙医保能刷吗”，AI 几乎只推公立科普。", table_cell),
            Paragraph("公立三甲百科垄断<br/><b>所有民营机构在此全部缺位！</b>", table_cell),
            Paragraph("<b>【最大增量蓝海】</b>没有任何竞争对手在此筑墙！松鼠只需投入 15~20 篇带价格表与流程的长文，即可低成本全量收割。", table_cell)
        ]
    ]

    t_biz = Table(biz_data, colWidths=[95, 135, 110, 159])
    t_biz.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1E3A8A')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E0')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#FFFFFF'), colors.HexColor('#F8FAFC')]),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_biz)
    story.append(Spacer(1, 10))

    # 5. 四、为什么会失守？AI 算法决策的底层逻辑（帮老板看清底层）
    story.append(Paragraph("四、底层机理解密：为什么有的词 AI 不推松鼠？", sec_title))
    story.append(Paragraph("通过逆向工程两家 AI 引擎调用的底层信源库，发现未被推荐绝非松鼠线下口碑不行，而是踩了 AI 算法的技术红线：", body))

    story.append(Paragraph("• <b>1. 纯医学常识拦截（AI 医疗红线）：</b>老百姓问‘拔完智齿几天能吃饭’、‘70岁高血压老人能否种牙’时，AI 判定为纯病理咨询，强制调用《中华口腔诊疗指南》，<b>全篇严禁植入任何商业门诊</b>（昆明所有民营机构在这些词下全部是 0 提及）。<br/>"
                           "• <b>2. 极端公立学术天花板垄断：</b>老百姓问‘种植牙最厉害的三家医院’时，DeepSeek 检索的是国家级重点实验室、院士团队与博士生导师库，直接锁死省口腔、昆华和市口腔三巨头，民营机构无法撼动其科研论文壁垒。<br/>"
                           "• <b>3. 算法缺乏现成的‘喂饭表格’：</b>豆包在回答价格类问题时，极度喜欢抓取一张现成的 <b>Markdown / HTML 对比表格</b>。目前全网缺乏松鼠各项目明码标价的结构化长文，AI 只能抓取第三方公立导购站的泛数据。", ParagraphStyle('BulletDark', fontName='ArialUnicode', fontSize=8, leading=13, textColor=colors.HexColor('#1E293B'), leftIndent=8, spaceAfter=4)))

    story.append(Spacer(1, 10))

    # 6. 五、老板决策落地指南：未来 30 天作战行动路线图
    plan_box = [
        [
            Paragraph("<b>🎯 呈报老板：未来 30 天内容突围与落地执行建议（3 步把 SOV 做到 85%+）</b><br/>"
                      "<b>第一步：启动「蓝海抢滩作战」（由企划/市场团队执行）：</b><br/>"
                      "针对目前 24 道双引擎失守的母题（拔智齿拍片时效、洗牙医保、补牙材料价格、冷光美白），定制 24 篇靶向问答长文。每篇必须附带<b>【松鼠口腔执行价格 + 医保报销说明 + 质保年限】</b>标准化对比表格。<br/>"
                      "<b>第二步：穿透核心引源阵地（精准喂养，不做无效投放）：</b><br/>"
                      "除了微信公众号，将内容重点分发至<b>《贝色口腔》、《牙舒丽》、《牙大师》</b>（占豆包 80% 报价来源）及今日头条、知乎本地专栏（DeepSeek 核心抓取源）。<br/>"
                      "<b>第三步：物理回测与指标考核（Truth Gate 闭环）：</b><br/>"
                      "文章上线 10 天后，使用我们的真实自动化巡航套件对这 24 道题重新跑测，以快照中是否由‘未提及’翻转为‘强力推荐松鼠’作为市场部量化交付考核！", callout_p)
        ]
    ]
    t_plan = Table(plan_box, colWidths=[499])
    t_plan.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#FEFCE8')), # Light yellow
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#EAB308')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_plan)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Boss Executive PDF successfully built: {filename}")

if __name__ == "__main__":
    out_pdf = "/Users/dulijuner/projects/geo-studio/apps/worker/src/trackers/_dev/Songshu_Dental_GEO_Executive_Report_for_Boss.pdf"
    build_pdf(out_pdf)
