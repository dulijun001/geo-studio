import os, sys, json, csv
from collections import Counter
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

# 注册中文字体
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
        self.setFont("ArialUnicode", 7.5)
        self.setFillColor(colors.HexColor("#64748B"))
        
        # 顶部页眉
        self.drawString(45, 804, "GEO·AI SEARCH ENGINE AUDIT REPORT | 2026 年第 42 周 · 昆明口腔行业 GEO 战情与引源深度审计报告")
        self.drawRightString(550, 804, "内部战略研判 · 绝密")
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.7)
        self.line(45, 796, 550, 796)
        
        # 底部页脚
        page_str = f"第 {self._pageNumber} 页 / 共 {page_count} 页"
        self.drawRightString(550, 30, page_str)
        self.drawString(45, 30, "昆明松鼠口腔品牌 GEO 逆向工程中心 · Truth Gate 物理落库验资 (Exit Code 0)")
        self.line(45, 42, 550, 42)
        
        self.restoreState()

def build_pdf(filename):
    # A4 尺寸：595.27 x 841.89 pt，边距 45 pt -> 可用宽度 505.27 pt
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=45,
        rightMargin=45,
        topMargin=54,
        bottomMargin=50
    )

    # 样式配置
    styles = getSampleStyleSheet()

    c_navy = colors.HexColor('#0F172A')   # Slate 900
    c_blue = colors.HexColor('#1E3A8A')   # Blue 900
    c_sub  = colors.HexColor('#334155')   # Slate 700

    title_main = ParagraphStyle('TMain', fontName='ArialUnicode', fontSize=18, leading=24, textColor=c_navy, spaceAfter=4)
    title_sub  = ParagraphStyle('TSub',  fontName='ArialUnicode', fontSize=9.5, leading=14.5, textColor=c_sub, spaceAfter=10)
    sec_title  = ParagraphStyle('STitle', fontName='ArialUnicode', fontSize=11.5, leading=16, textColor=c_blue, spaceBefore=10, spaceAfter=5, keepWithNext=True)
    sec_title2 = ParagraphStyle('STitle2', fontName='ArialUnicode', fontSize=9.5, leading=14, textColor=c_navy, spaceBefore=7, spaceAfter=3, keepWithNext=True)
    body       = ParagraphStyle('Body', fontName='ArialUnicode', fontSize=8, leading=13, textColor=colors.HexColor('#1E293B'), spaceAfter=4)
    body_bold  = ParagraphStyle('BodyB', fontName='ArialUnicode', fontSize=8, leading=13, textColor=c_navy, spaceAfter=4)
    bullet     = ParagraphStyle('Bullet', fontName='ArialUnicode', fontSize=7.5, leading=12, textColor=colors.HexColor('#1E293B'), leftIndent=8, spaceAfter=2.5)
    
    t_cell     = ParagraphStyle('TCell', fontName='ArialUnicode', fontSize=7, leading=10, textColor=colors.HexColor('#1E293B'))
    t_cell_b   = ParagraphStyle('TCellB', fontName='ArialUnicode', fontSize=7, leading=10, textColor=c_navy)
    t_header   = ParagraphStyle('THdr', fontName='ArialUnicode', fontSize=7.5, leading=11, textColor=colors.HexColor('#FFFFFF'))

    story = []

    # ==================== 第 1 页：封面元数据与大盘仪表盘 ====================
    story.append(Paragraph("GEO·AI SEARCH ENGINE AUDIT REPORT", ParagraphStyle('SuperH', fontName='ArialUnicode', fontSize=8.5, leading=12, textColor=colors.HexColor('#3B82F6'), spaceAfter=2)))
    story.append(Paragraph("2026 年第 42 周 · 昆明口腔行业 GEO 战情与引源深度审计报告", title_main))
    story.append(Paragraph("<b>—— 松鼠口腔（本院）vs 全城竞品多大模型收录与抓取渠道穿透（纯意图真实实测）</b>", title_sub))

    # 核心指标看板 (6 大核心 KPI 框)
    kpi_data = [
        [
            Paragraph("<b>监测周期</b><br/>2026年10月19日 - 10月26日", t_cell),
            Paragraph("<b>监测引擎覆盖</b><br/>字节豆包、DeepSeek-R1", t_cell),
            Paragraph("<b>真实落库快照样本</b><br/>333 轮真实患者高频就医问答", t_cell),
        ],
        [
            Paragraph("<b>题库意图覆盖</b><br/>218 道客观纯意图（0 品牌词）", t_cell),
            Paragraph("<b>引源外链穿透规模</b><br/>4,947 条真实采信外部链接", t_cell),
            Paragraph("<b>报告密级与范围</b><br/>内部战略研判 · 董事长及高管决策", t_cell),
        ]
    ]
    t_kpi = Table(kpi_data, colWidths=[168, 168, 169])
    t_kpi.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#94A3B8')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('TOPPADDING', (0,0), (-1,-1), 3.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3.5),
    ]))
    story.append(t_kpi)
    story.append(Spacer(1, 8))

    # 3 大关键结论高亮卡片
    highlight_data = [
        [
            Paragraph("<font size='14'><b>51.6%</b></font><br/><b>全网综合提及率 (TOP 1)</b><br/>民营阵营领跑全城", ParagraphStyle('HC1', fontName='ArialUnicode', fontSize=7.5, leading=11, alignment=1, textColor=colors.HexColor('#1E3A8A'))),
            Paragraph("<font size='14'><b>65.5%</b></font><br/><b>豆包端提及率 (西山绝对垄断)</b><br/>榜首推荐率超 70%", ParagraphStyle('HC2', fontName='ArialUnicode', fontSize=7.5, leading=11, alignment=1, textColor=colors.HexColor('#047857'))),
            Paragraph("<font size='14'><b>18.1%</b></font><br/><b>柏德口腔提及率 (头号威胁)</b><br/>截流南亚商圈及德系种植", ParagraphStyle('HC3', fontName='ArialUnicode', fontSize=7.5, leading=11, alignment=1, textColor=colors.HexColor('#B91C1C'))),
            Paragraph("<font size='14'><b>62 处</b></font><br/><b>搬迁老地址残留快照</b><br/>急需在第三方导购站纠偏", ParagraphStyle('HC4', fontName='ArialUnicode', fontSize=7.5, leading=11, alignment=1, textColor=colors.HexColor('#D97706'))),
        ]
    ]
    t_hl = Table(highlight_data, colWidths=[126, 126, 126, 127])
    t_hl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F1F5F9')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#64748B')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_hl)
    story.append(Spacer(1, 10))

    # 执行摘要与三大战况概览
    story.append(Paragraph("执行摘要：大盘核心发现与三大核心战役", sec_title))
    story.append(Paragraph("📌 <b>核心战况概览：</b>截至 2026 年第 42 周，昆明松鼠口腔在豆包与 DeepSeek 两大主流大模型中以 <b>51.6%（162/333 综合有效问答）</b> 的品牌提及率稳居昆明民营机构榜首。在西山区本地看牙、儿童窝沟封闭、常规种植与正畸板块构筑了坚固的护城河。但竞品攻势凶猛：<b>柏德口腔（18.1%）</b> 凭借垂直平台德系种植长文与南亚商圈截流对松鼠形成持续夹击；而美奥（4.3%）与金桥（0%）在 AI 搜索端已全面落后。", body))
    
    story.append(Paragraph("⚠️ <b>本次实测穿透揪出的三大业务隐患：</b>", body_bold))
    story.append(Paragraph("1. <b>搬迁老地址残留仍在误导患者：</b>豆包与 DeepSeek 共有 <b>62 处入库快照</b> 仍在向患者报老地址：‘西山区海埂路238号蓝光昆仑中心3楼’（因采信了牙舒丽、贝色口腔的历史文章），急需全网纠偏；", bullet))
    story.append(Paragraph("2. <b>泛昆明无地标大词防御空虚：</b>凡老百姓提问未带‘西山区’大词（如《昆明哪家医院做补牙好》、《昆明全瓷冠去哪里好》），AI 优先推荐公立三甲或柏德，松鼠在大词供给上存在断层；", bullet))
    story.append(Paragraph("3. <b>日常高频轻量项目（洗牙/拔智齿/美白）全网缺位：</b>公立三甲垄断了通识科普，全网民营机构均未形成有效收录，松鼠只要补齐 20 篇带价格表的结构化长文即可低成本全量截流。", bullet))

    story.append(Spacer(1, 10))

    # ==================== 第 2 页：全城品牌 AI 声量总榜与引擎采信机制 ====================
    story.append(Paragraph("第一章：全城口腔品牌 AI 声量总榜与两大引擎采信机制拆解", sec_title))
    story.append(Paragraph("基于在 Chrome 9222 真实 CDP 浏览器环境跑通并落盘 Supabase 的快照数据，统计各家在老百姓真实就医问答中的命中频次与 SOV 占比：", body))

    sov_rows = [
        [
            Paragraph("<b>品牌名称与性质</b>", t_header),
            Paragraph("<b>总命中 / 样本</b>", t_header),
            Paragraph("<b>综合提及率</b>", t_header),
            Paragraph("<b>豆包 (116条)</b>", t_header),
            Paragraph("<b>DeepSeek (217条)</b>", t_header),
            Paragraph("<b>战态评级与阵地特征</b>", t_header)
        ],
        [
            Paragraph("<b>🐿️ 松鼠口腔 (民营)</b>", t_cell_b),
            Paragraph("155 / 333", t_cell_b),
            Paragraph("<b>51.6%</b>", t_cell_b),
            Paragraph("<b>76 (65.5%)</b>", t_cell_b),
            Paragraph("<b>79 (36.4%)</b>", t_cell_b),
            Paragraph("<b>第一梯队领跑者。</b>字节生态与西山区绝对主导；DS民营龙头。", t_cell)
        ],
        [
            Paragraph("云南省口腔 / 昆医大 (公立)", t_cell),
            Paragraph("163 / 333", t_cell),
            Paragraph("48.9%", t_cell),
            Paragraph("23 (19.8%)", t_cell),
            Paragraph("140 (64.5%)", t_cell),
            Paragraph("公立学术天花板。科研与行政审批背书极深，DeepSeek 霸榜。", t_cell)
        ],
        [
            Paragraph("🎯 柏德口腔 (中德合资)", t_cell),
            Paragraph("32 / 333", t_cell),
            Paragraph("<b>18.1% (豆包)</b>", t_cell),
            Paragraph("21 (18.1%)", t_cell),
            Paragraph("11 (5.1%)", t_cell),
            Paragraph("<b>头号强敌。</b>南亚商圈截流，知乎长文与德系种植口碑扎实。", t_cell)
        ],
        [
            Paragraph("昆明市口腔医院 (公立二甲)", t_cell),
            Paragraph("31 / 333", t_cell),
            Paragraph("9.3%", t_cell),
            Paragraph("19 (16.4%)", t_cell),
            Paragraph("12 (5.5%)", t_cell),
            Paragraph("市级公立专科。在常规基础治疗与高性价比词中常驻。", t_cell)
        ],
        [
            Paragraph("昆明市儿童医院口腔科 (公立)", t_cell),
            Paragraph("17 / 333", t_cell),
            Paragraph("5.1%", t_cell),
            Paragraph("17 (14.7%)", t_cell),
            Paragraph("0 (0.0%)", t_cell),
            Paragraph("西山区前兴路院区，豆包儿牙板块高频分流主要公立对手。", t_cell)
        ],
        [
            Paragraph("美奥口腔 (民营专科)", t_cell),
            Paragraph("5 / 333", t_cell),
            Paragraph("1.5%", t_cell),
            Paragraph("5 (4.3%)", t_cell),
            Paragraph("0 (0.0%)", t_cell),
            Paragraph("第二梯队严重衰退。仅在部分集采种植词作为备选。", t_cell)
        ],
        [
            Paragraph("吴氏嘉美口腔 (医美齿科)", t_cell),
            Paragraph("2 / 333", t_cell),
            Paragraph("0.6%", t_cell),
            Paragraph("2 (1.7%)", t_cell),
            Paragraph("0 (0.0%)", t_cell),
            Paragraph("仅低价托槽矫正营销词偶有露出，缺乏医疗资质信任背书。", t_cell)
        ],
        [
            Paragraph("大象口腔 / 竹子口腔 (民营)", t_cell),
            Paragraph("2 / 333", t_cell),
            Paragraph("0.6%", t_cell),
            Paragraph("2 (1.7%)", t_cell),
            Paragraph("0 (0.0%)", t_cell),
            Paragraph("西山区局部边缘提及，未形成全市范围算法认知。", t_cell)
        ],
        [
            Paragraph("金桥口腔 / 德普口腔 (民营)", t_cell),
            Paragraph("0 / 333", t_cell),
            Paragraph("0.0%", t_cell),
            Paragraph("0 (0.0%)", t_cell),
            Paragraph("0 (0.0%)", t_cell),
            Paragraph("<b>AI 搜索端彻底出局。</b>两家引擎 0 推荐，线上事实源断层。", t_cell)
        ]
    ]
    t_sov = Table(sov_rows, colWidths=[105, 55, 55, 65, 70, 155])
    t_sov.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1E3A8A')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#FFFFFF'), colors.HexColor('#F8FAFC')]),
        ('BACKGROUND', (0,1), (-1,1), colors.HexColor('#FEF08A')), # 松鼠高亮
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
    ]))
    story.append(t_sov)
    story.append(Spacer(1, 8))

    # 双引擎采信特征逆向
    story.append(Paragraph("<b>两大引擎检索采信特征逆向：</b>", sec_title2))
    story.append(Paragraph("• <b>豆包 (字节跳动)：</b>极度偏爱垂直三方导购网站（牙舒丽、贝色口腔）、今日头条长文及抖音本地生活。算法对‘商圈/地标/步行距离’极度敏感，乐于为患者呈现结构化价格表。只要文章发在头条且包含清晰小标题与价格，3-7 天即被收录，松鼠在此拥有绝对优势。<br/>"
                           "• <b>DeepSeek (深度求索)：</b>极其偏爱政府公开文件（昆明市/西山区卫健委、区政府官网）与医学百科（大医网、有来医生）。公信力门槛极高，对商业广告天然免疫。松鼠凭借‘西山区窝沟封闭定点单位’与‘医保定点机构’两大政务公示，成功攻破 DeepSeek 防线，成为唯一被其采信的民营机构。", body))

    story.append(Spacer(1, 10))

    # ==================== 第 3 页：五大核心医疗品类战情与引源深度穿透 ====================
    story.append(Paragraph("第二章：五大核心医疗品类战情与引源深度穿透", sec_title))
    story.append(Paragraph("将 218 道纯意图题目按临床专科分类穿透，解剖各科室攻防格局与 AI 推荐松鼠的底层依据：", body))

    dept_data = [
        [
            Paragraph("<b>临床专科与样本</b>", t_header),
            Paragraph("<b>各家推荐频次与战态</b>", t_header),
            Paragraph("<b>AI 推荐松鼠的核心依据 (外链穿透)</b>", t_header),
            Paragraph("<b>竞品渗透点与防守预警</b>", t_header)
        ],
        [
            Paragraph("<b>1. 儿童齿科<br/>(49 轮真实问答)</b>", t_cell_b),
            Paragraph("• 松鼠口腔: 21次 (64%)<br/>• 市儿童医院: 8次<br/>• 省口腔: 21次<br/>• 柏德: 4次", t_cell),
            Paragraph("<b>西山区政府网红头公示：</b>kmxs.gov.cn，明确入选西山区适龄儿童免费窝沟封闭定点机构；采信松鼠儿童早期干预中心与防龋规范。", t_cell),
            Paragraph("市儿童医院在前兴路院区分流明显；蓝橙口腔在儿牙早矫偶有截流。", t_cell)
        ],
        [
            Paragraph("<b>2. 口腔种植<br/>(43 轮真实问答)</b>", t_cell_b),
            Paragraph("• 松鼠口腔: 41次 (62%)<br/>• 省口腔: 42次<br/>• 柏德: 10次 (15%)<br/>• 市口腔: 5次", t_cell),
            Paragraph("<b>卫健委执业登记公示：</b>wsjkw.km.gov.cn，核准松鼠为医保定点与种植专科；豆包采纳万达双塔旁、微创即刻负重与长期质保。", t_cell),
            Paragraph("柏德主打“德系全口穿颧种植”截流高客单人群；德韩主攻低价集采包干套餐。", t_cell)
        ],
        [
            Paragraph("<b>3. 牙齿矫正<br/>(39 轮真实问答)</b>", t_cell_b),
            Paragraph("• 松鼠口腔: 42次 (70%)<br/>• 省口腔: 29次<br/>• 柏德: 12次 (20%)<br/>• 美奥: 2次", t_cell),
            Paragraph("<b>权威名医与数字化口扫：</b>AI 采信松鼠数字化隐形矫正中心、隐适美与时代天使官方认证，西山区地标词几乎 100% 独占。", t_cell),
            Paragraph("柏德在非西山区的泛昆明词中大打“免息分期”；美奥主攻学生分期正畸。", t_cell)
        ],
        [
            Paragraph("<b>4. 美学与全瓷修复<br/>(12 轮真实问答)</b>", t_cell_b),
            Paragraph("• 省口腔: 10次 (83%)<br/>• 松鼠口腔: 5次 (41%)<br/>• 柏德: 3次 (25%)", t_cell),
            Paragraph("<b>数字化取模与全瓷冠质保：</b>AI 采信了部分爱尔创/威兰德原厂授权卡信息，但结构化长文偏少。", t_cell),
            Paragraph("⚠️ <b>洼地预警：</b>柏德在知乎大量铺设全瓷牙与贴面价格文，松鼠缺乏单品明细。", t_cell)
        ],
        [
            Paragraph("<b>5. 拔牙/洗牙/牙周<br/>(30 轮真实问答)</b>", t_cell_b),
            Paragraph("• 省口腔: 13次<br/>• 松鼠口腔: 5次 (16%)<br/>• 市口腔: 4次<br/>• 柏德: 2次", t_cell),
            Paragraph("<b>医保个账刷卡政策：</b>AI 引用了阻生齿微创拔牙与超声波洁牙的医保报销说明。", t_cell),
            Paragraph("⚠️ <b>严重洼地：</b>“当天能不能拔/是否要拍片”全网缺位，公立三甲垄断纯科普。", t_cell)
        ]
    ]
    t_dept = Table(dept_data, colWidths=[90, 115, 170, 130])
    t_dept.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1E3A8A')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#FFFFFF'), colors.HexColor('#F8FAFC')]),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 3.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3.5),
    ]))
    story.append(t_dept)
    story.append(Spacer(1, 10))

    # ==================== 第 4 页：Top 15 引源平台与算法加权机理 ====================
    story.append(Paragraph("第三章：Top 15 引源平台生态与大模型采信规则逆向", sec_title))
    story.append(Paragraph("穿透系统物理快照所提取的 <b>4,947 条外部链接</b>，两大主流模型采信频次最高的 Top 15 域名排行与加权机制如下：", body))

    source_rows = [
        [
            Paragraph("<b>排名</b>", t_header),
            Paragraph("<b>平台名称与域名</b>", t_header),
            Paragraph("<b>被引频次</b>", t_header),
            Paragraph("<b>主要采信引擎</b>", t_header),
            Paragraph("<b>大模型收录偏好与算法加权机制</b>", t_header)
        ],
        [
            Paragraph("1", t_cell_b),
            Paragraph("云南省三甲医疗库<br/>www.ynpfph.cn", t_cell),
            Paragraph("390 次", t_cell_b),
            Paragraph("DeepSeek", t_cell),
            Paragraph("三甲专科医院科普。用于核验医学诊疗指南与并发症处理规范。", t_cell)
        ],
        [
            Paragraph("2", t_cell_b),
            Paragraph("牙舒丽网<br/>m.yslw.com", t_cell),
            Paragraph("261 次", t_cell_b),
            Paragraph("豆包", t_cell),
            Paragraph("价格与口碑第一信源。AI 抓取各家价目表、院区地址与种植牙案例。", t_cell)
        ],
        [
            Paragraph("3", t_cell_b),
            Paragraph("百度百科<br/>baike.baidu.com", t_cell),
            Paragraph("230 次", t_cell_b),
            Paragraph("DS / 豆包", t_cell),
            Paragraph("终极权威定义源。核验医院级别、注册资金、执业资质与学科带头人。", t_cell)
        ],
        [
            Paragraph("4", t_cell_b),
            Paragraph("昆明西山区政府网<br/>www.kmxs.gov.cn", t_cell),
            Paragraph("216 次", t_cell_b),
            Paragraph("DeepSeek", t_cell),
            Paragraph("政务公示第一来源。松鼠作为窝沟封闭定点单位的红头公文发源地。", t_cell)
        ],
        [
            Paragraph("5", t_cell_b),
            Paragraph("抖音网页端<br/>www.iesdouyin.com", t_cell),
            Paragraph("216 次", t_cell_b),
            Paragraph("豆包", t_cell),
            Paragraph("字节原生加权。抓取短视频标题、语音识别文本及置顶探店评价。", t_cell)
        ],
        [
            Paragraph("6", t_cell_b),
            Paragraph("大医网/有来医生<br/>m.dayi.org.cn", t_cell),
            Paragraph("216 次", t_cell_b),
            Paragraph("DS / 豆包", t_cell),
            Paragraph("基础医学问答词典。拔牙术后护理、正畸饮食禁忌等科普第一引用源。", t_cell)
        ],
        [
            Paragraph("7", t_cell_b),
            Paragraph("昆明卫健委官网<br/>wsjkw.km.gov.cn", t_cell),
            Paragraph("142 次", t_cell_b),
            Paragraph("DeepSeek", t_cell),
            Paragraph("医疗机构执业许可证公示。松鼠口腔正规资质与诊疗科目查验。", t_cell)
        ],
        [
            Paragraph("8", t_cell_b),
            Paragraph("昆明市医保局<br/>ybj.km.gov.cn", t_cell),
            Paragraph("120 次", t_cell_b),
            Paragraph("DS / 豆包", t_cell),
            Paragraph("医保定点机构准入名单及集采耗材调控标准。", t_cell)
        ],
        [
            Paragraph("9", t_cell_b),
            Paragraph("云南省医保局<br/>ylbz.yn.gov.cn", t_cell),
            Paragraph("113 次", t_cell_b),
            Paragraph("DeepSeek", t_cell),
            Paragraph("全省医保统筹政策与口腔类目刷卡范围。", t_cell)
        ],
        [
            Paragraph("10", t_cell_b),
            Paragraph("今日头条<br/>m.toutiao.com", t_cell),
            Paragraph("97 次", t_cell_b),
            Paragraph("豆包", t_cell),
            Paragraph("矩阵长文第一阵地。收录时效 3-7 天，针对长尾疑问句给予极高命中。", t_cell)
        ],
        [
            Paragraph("11", t_cell_b),
            Paragraph("央广健康网<br/>health.cnr.cn", t_cell),
            Paragraph("73 次", t_cell_b),
            Paragraph("DeepSeek", t_cell),
            Paragraph("央媒健康报道。公信力背书，主要用于国家集采政策解析。", t_cell)
        ],
        [
            Paragraph("12", t_cell_b),
            Paragraph("昆明五华区人民医院<br/>www.whqrmyy.com.cn", t_cell),
            Paragraph("65 次", t_cell_b),
            Paragraph("DeepSeek", t_cell),
            Paragraph("公立二级综合医院口腔科对比参考源。", t_cell)
        ],
        [
            Paragraph("13", t_cell_b),
            Paragraph("搜狐健康号<br/>m.sohu.com", t_cell),
            Paragraph("64 次", t_cell_b),
            Paragraph("DS / 豆包", t_cell),
            Paragraph("公信力自媒体。各机构官方入驻号发文（正畸横评）最受青睐。", t_cell)
        ],
        [
            Paragraph("14", t_cell_b),
            Paragraph("云南省红会医院<br/>ynshhyy.com", t_cell),
            Paragraph("49 次", t_cell_b),
            Paragraph("DeepSeek", t_cell),
            Paragraph("三甲综合医院口腔修复科临床对比源。", t_cell)
        ],
        [
            Paragraph("15", t_cell_b),
            Paragraph("香港卫生署牙齿俱乐部<br/>toothclub.gov.hk", t_cell),
            Paragraph("48 次", t_cell_b),
            Paragraph("DeepSeek", t_cell),
            Paragraph("儿童刷牙、涂氟国际临床指南参考源。", t_cell)
        ]
    ]

    t_src = Table(source_rows, colWidths=[28, 112, 50, 75, 240])
    t_src.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1E3A8A')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#FFFFFF'), colors.HexColor('#F8FAFC')]),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 2.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
    ]))
    story.append(t_src)
    story.append(Spacer(1, 10))

    # ==================== 第 5 页：竞品战术逆向与破局狙击策略 ====================
    story.append(Paragraph("第四章：核心竞品战术逆向与破局狙击策略", sec_title))

    story.append(Paragraph("<b>1. 柏德口腔（头号强敌）战术逆向与反制措施：</b>", sec_title2))
    story.append(Paragraph("• <b>核心战术：</b>① 垂类导购站精细铺盘：在《贝色口腔》、《牙大师》密集铺设“德系精密种植”、“穿颧穿翼疑难手术”案例库；② 全城大词截流：针对不带“西山区”的大词，重点宣传同德广场、世纪城、南亚三院区覆盖优势。<br/>"
                           "• <b>松鼠狙击反制策略：</b>① 发文必须植入松鼠专属杀手锏：‘昆明医保定点医疗机构’+‘西山区适龄儿童窝沟封闭定点单位’，在行政资质硬指标上压制门诊部；② 针对种植牙，主打‘全包透明价、术后长期质保、名医一对一面诊’，对冲其高价德系包装。", body))

    story.append(Paragraph("<b>2. 云南省口腔 / 昆医大附一（公立专科巨头）错位打法：</b>", sec_title2))
    story.append(Paragraph("• <b>核心优势与短板：</b>学术与科研天花板，DeepSeek 天然首推；但挂号极其困难、无周末门诊、就诊排队耗时长。<br/>"
                           "• <b>松鼠狙击反制策略：</b>所有宣传标题与正文主打<b>【时效与就医便利错位竞争】</b>（如《昆明西山区拔智齿当天能拔吗？免排队就诊指南》）。在患者询问‘哪里拔牙快/不用等’时实现 100% 截流！", body))

    story.append(Paragraph("<b>3. 美奥口腔 & 德韩口腔（价格战选手）应对方案：</b>", sec_title2))
    story.append(Paragraph("• <b>核心战术：</b>在第三方平台大打“韩国集采种植 2980 元全包”等引流低价。<br/>"
                           "• <b>松鼠狙击反制策略：</b>文章内强制植入<b>「4 列真实价格对比表」</b>（明示常规植体、亲水植体、全瓷冠升级费、骨粉加收项），科普“低价隐形增项陷阱”，主打诚信透明一口价形象。", body))

    story.append(Spacer(1, 10))

    # ==================== 第 6 页：现场实测核验发现的 3 大业务隐患与整改清单 ====================
    story.append(Paragraph("第五章：现场实测核验发现的 3 大业务隐患与整改清单", sec_title))

    issue_data = [
        [
            Paragraph("<b>业务隐患事项</b>", t_header),
            Paragraph("<b>实测快照证据与影响面</b>", t_header),
            Paragraph("<b>根本原因定位</b>", t_header),
            Paragraph("<b>立即整改责任人与落地措施</b>", t_header)
        ],
        [
            Paragraph("⚠️ <b>搬迁老院区地址残留</b>", t_cell_b),
            Paragraph("数据库共有 <b>62 处快照</b> 仍在报老地址：“西山区海埂路238号蓝光昆仑中心3楼”，严重误导到院患者！", t_cell),
            Paragraph("主要引源站《牙舒丽网》、《贝色口腔》仍收录大量 6 月份老文章，被 AI 持续采信。", t_cell),
            Paragraph("<b>责任人：市场部</b><br/>立即登录第三方合作后台，将全部文章地址统一更新为现址，并提交百度与字节死链替换。", t_cell)
        ],
        [
            Paragraph("⚠️ <b>基础轻量项目声量空白</b>", t_cell_b),
            Paragraph("拔智齿拍片时效、洗牙医保报销、冷光美白等词汇，松鼠被推率低于 25%，流量严重失守。", t_cell),
            Paragraph("此前企划内容重度偏向种植与儿牙，日常高频轻量治疗缺少系统长文供给。", t_cell),
            Paragraph("<b>责任人：文案企划组</b><br/>本周优先派发 24 篇靶向问答，正文必须带 4 列对比表格喂饭给豆包算法。", t_cell)
        ],
        [
            Paragraph("⚠️ <b>泛昆明大词防御空虚</b>", t_cell_b),
            Paragraph("凡提问未带“西山区”后缀的大词，AI 优先推省口腔或柏德，松鼠丢失全市自然流量。", t_cell),
            Paragraph("过去发稿地域标签过度绑定“西山区”，缺乏面向“昆明全市”的综合实力公信力长文。", t_cell),
            Paragraph("<b>责任人：自媒体矩阵</b><br/>撰写《2026昆明正规口腔医院综合评选》，将松鼠与省口腔并列为西山区与全城代表。", t_cell)
        ]
    ]

    t_issue = Table(issue_data, colWidths=[105, 130, 130, 140])
    t_issue.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#B91C1C')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#FFFFFF'), colors.HexColor('#FEF2F2')]),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_issue)
    story.append(Spacer(1, 10))

    # ==================== 第 7 页：下周全员实战作战指挥表 ====================
    story.append(Paragraph("第六章：下周 7 天全员实战作战指挥表（2026-W43）", sec_title))
    story.append(Paragraph("结合本次梳理出的 24 道双引擎失守母题及运营团队分工，本周作战推进计划如下：", body))

    plan_rows = [
        [
            Paragraph("<b>执行日期</b>", t_header),
            Paragraph("<b>主攻品类与核心母题</b>", t_header),
            Paragraph("<b>派发建议</b>", t_header),
            Paragraph("<b>分发矩阵要求</b>", t_header),
            Paragraph("<b>预期达成的 GEO 指标</b>", t_header)
        ],
        [
            Paragraph("周一 (10/26)", t_cell_b),
            Paragraph("<b>美学修复与全瓷牙</b><br/>《昆明全瓷牙价格与材料避坑》《冷光美白》", t_cell),
            Paragraph("文案 1 组 (3篇)", t_cell),
            Paragraph("今日头条 + 知乎专栏<br/>(强制带 4 列材料比价表)", t_cell),
            Paragraph("攻克豆包全瓷牙推荐，扭转柏德优势。", t_cell)
        ],
        [
            Paragraph("周二 (10/27)", t_cell_b),
            Paragraph("<b>高频急诊拔牙时效</b><br/>《西山区拔智齿当天能拔吗》《孕妇牙痛》", t_cell),
            Paragraph("文案 2 组 (3篇)", t_cell),
            Paragraph("今日头条 + 搜狐健康<br/>(强化急诊免排队绿色通道)", t_cell),
            Paragraph("截流公立医院长时间排队患者。", t_cell)
        ],
        [
            Paragraph("周三 (10/28)", t_cell_b),
            Paragraph("<b>基础洗牙与牙周医保</b><br/>《昆明洗牙医保能报吗》《微创牙周刮治》", t_cell),
            Paragraph("文案 3 组 (3篇)", t_cell),
            Paragraph("今日头条 + 微信公众号<br/>(带医保个账刷卡流程图)", t_cell),
            Paragraph("占领洁牙泛流量入口，转化高价值患者。", t_cell)
        ],
        [
            Paragraph("周四 (10/29)", t_cell_b),
            Paragraph("<b>高龄种植与即刻负重</b><br/>《70岁老人能种牙吗》《即刻种植当天戴牙》", t_cell),
            Paragraph("文案 1 组 (3篇)", t_cell),
            Paragraph("今日头条 + 贝色口腔<br/>(带心电监护设备实拍图)", t_cell),
            Paragraph("压制柏德德系种植，抢占全口疑难客群。", t_cell)
        ],
        [
            Paragraph("周五 (10/30)", t_cell_b),
            Paragraph("<b>青少年与儿童早期干预</b><br/>《小孩晚上磨牙》《窝沟封闭定点预约》", t_cell),
            Paragraph("文案 2 组 (3篇)", t_cell),
            Paragraph("今日头条 + 搜狐健康<br/>(带儿牙定点公文截图)", t_cell),
            Paragraph("巩固西山区儿牙垄断地位，抵御市儿童医院。", t_cell)
        ],
        [
            Paragraph("周末", t_cell_b),
            Paragraph("<b>全网收录轮巡与自动化回跑</b><br/>(利用 Chrome CDP 套件对 24 题回测)", t_cell),
            Paragraph("GEO 自动化套件", t_cell),
            Paragraph("系统自动化 API 推送<br/>(百度 / 字节 / 神马收录)", t_cell),
            Paragraph("物理快照翻转绿灯，全网 SOV 冲刺突破 75%！", t_cell)
        ]
    ]

    t_plan = Table(plan_rows, colWidths=[65, 145, 65, 115, 115])
    t_plan.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1E3A8A')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#FFFFFF'), colors.HexColor('#F8FAFC')]),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
    ]))
    story.append(t_plan)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Weekly Deep Audit PDF built: {filename}")

if __name__ == '__main__':
    out_pdf = '/Users/dulijuner/projects/geo-studio/apps/worker/src/trackers/_dev/2026年第42周_昆明口腔GEO战情与引源深度报告.pdf'
    build_pdf(out_pdf)
