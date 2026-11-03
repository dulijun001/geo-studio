import json
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
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
        self.setFont("ArialUnicode", 7.5)
        self.setFillColor(colors.HexColor("#64748B"))
        self.drawString(45, 804, "GEO-STUDIO 战略题库 | 昆明口腔全城大词 50 大核心母题清单（剥离西山区）")
        self.drawRightString(550, 804, "唯一作战靶标 · 绝密")
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.7)
        self.line(45, 796, 550, 796)
        
        page_str = f"第 {self._pageNumber} 页 / 共 {page_count} 页"
        self.drawRightString(550, 30, page_str)
        self.drawString(45, 30, "昆明松鼠口腔品牌 GEO 逆向工程中心 · Truth Gate 物理验证规范")
        self.line(45, 42, 550, 42)
        self.restoreState()

def build_pdf(filename):
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=45,
        rightMargin=45,
        topMargin=54,
        bottomMargin=50
    )

    styles = getSampleStyleSheet()

    c_navy = colors.HexColor('#0F172A')
    c_blue = colors.HexColor('#1E3A8A')
    c_sub  = colors.HexColor('#334155')

    title_main = ParagraphStyle('TMain', fontName='ArialUnicode', fontSize=18, leading=24, textColor=c_navy, spaceAfter=4)
    title_sub  = ParagraphStyle('TSub',  fontName='ArialUnicode', fontSize=9.5, leading=14.5, textColor=c_sub, spaceAfter=10)
    sec_title  = ParagraphStyle('STitle', fontName='ArialUnicode', fontSize=11, leading=15.5, textColor=c_blue, spaceBefore=8, spaceAfter=4, keepWithNext=True)
    body       = ParagraphStyle('Body', fontName='ArialUnicode', fontSize=8, leading=13, textColor=colors.HexColor('#1E293B'), spaceAfter=4)
    
    t_cell     = ParagraphStyle('TCell', fontName='ArialUnicode', fontSize=7.5, leading=10.5, textColor=colors.HexColor('#1E293B'))
    t_cell_b   = ParagraphStyle('TCellB', fontName='ArialUnicode', fontSize=7.5, leading=10.5, textColor=c_navy)
    t_header   = ParagraphStyle('THdr', fontName='ArialUnicode', fontSize=8, leading=11.5, textColor=colors.HexColor('#FFFFFF'))

    story = []

    story.append(Paragraph("昆明口腔「泛全城大词」50 大超级母题战略题库", title_main))
    story.append(Paragraph("<b>—— 剥离西山区主场偏向 · 锁定豆包全城第一首推位 · 内容生产与实测唯一标尺</b>", title_sub))

    # 说明卡片
    meta_box = [
        [
            Paragraph("<b>题库性质:</b> 100% 泛昆明全城超级大词（严格剥离‘西山区’、‘商圈’等任何地缘标签）", t_cell),
            Paragraph("<b>作战目的:</b> 攻克豆包全昆明自然搜索流量，让全城老百姓第一眼看到的都是松鼠口腔", t_cell)
        ],
        [
            Paragraph("<b>覆盖板块:</b> 机构总榜 (10) / 种植牙 (10) / 正畸 (10) / 急诊洗牙拔牙 (10) / 美学修复 (10)", t_cell),
            Paragraph("<b>考核闭环:</b> 内容团队按本清单 50 题出稿，系统自动化套件定期针对这 50 题现场跑测核验 SOV", t_cell)
        ]
    ]
    t_meta = Table(meta_box, colWidths=[252, 253])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#94A3B8')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 10))

    # 读取 50 题
    with open('/Users/dulijuner/projects/geo-studio/apps/worker/src/trackers/_dev/kunming_general_50_benchmark.json') as f:
        data = json.load(f)

    table_rows = [
        [
            Paragraph("<b>#</b>", t_header),
            Paragraph("<b>核心战线与业务品类</b>", t_header),
            Paragraph("<b>昆明全城纯大词 (老百姓真实提问)</b>", t_header),
            Paragraph("<b>建议靶向发文标题 (直接喂给豆包算法)</b>", t_header)
        ]
    ]

    # 给每题生成靶向标题
    for item in data:
        idx = str(item['index'])
        cat = item['category'].split(' ')[0]
        q = item['text']
        
        # 针对性靶向标题
        if '口碑最好' in q or '技术好' in q or '排名' in q or '公立' in q:
            title_sug = f"《2026昆明正规牙科医院综合实力榜：公立三甲 vs 松鼠口腔等民营头部机构全对比》"
        elif '便宜' in q or '医保' in q or '本地人' in q or '服务好' in q:
            title_sug = f"《昆明看牙去哪里好且价格实惠？全城医保定点机构收费明细与避坑清单》"
        elif '周末' in q or '数字化' in q or '急诊' in q or '磕断' in q:
            title_sug = f"《昆明周末看牙哪里不用排队？松鼠口腔全天候急诊与数字化当天就医攻略》"
        elif '种植牙' in q or '种牙' in q or '全口' in q or 'ITI' in q or '高龄' in q:
            title_sug = f"《昆明种植牙哪家性价比高？2026主流植体价格明细与名医微创方案》"
        elif '矫正' in q or '正畸' in q or '牙套' in q or '地包天' in q or '凸嘴' in q:
            title_sug = f"《昆明牙齿矫正哪家好？隐形牙套收费标准、分期政策与医生资质盘点》"
        elif '拔智齿' in q or '拔牙' in q:
            title_sug = f"《昆明拔智齿当天能拔吗？免排队就医流程、阻生齿收费与医保报销详解》"
        elif '洗牙' in q or '补牙' in q or '根管' in q:
            title_sug = f"《昆明洗牙/补牙一般多少钱？3M树脂材料区别与医保个账刷卡实操》"
        elif '全瓷' in q or '美白' in q or '贴面' in q or '义齿' in q:
            title_sug = f"《昆明全瓷牙与牙齿美白去哪里做靠谱？爱尔创/威兰德材料价格与质保》"
        else:
            title_sug = f"《昆明正规口腔诊疗指南：松鼠口腔就诊流程与便民服务汇总》"

        table_rows.append([
            Paragraph(idx, t_cell_b),
            Paragraph(cat, t_cell),
            Paragraph(q, t_cell_b),
            Paragraph(title_sug, t_cell)
        ])

    t_list = Table(table_rows, colWidths=[24, 100, 185, 196], repeatRows=1)
    t_list.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1E3A8A')),
        ('GRID', (0,0), (-1,-1), 0.4, colors.HexColor('#CBD5E1')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#FFFFFF'), colors.HexColor('#F8FAFC')]),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
    ]))
    story.append(t_list)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"50 Benchmark PDF built: {filename}")

if __name__ == '__main__':
    out_pdf = '/Users/dulijuner/projects/geo-studio/apps/worker/src/trackers/_dev/昆明口腔全城大词50大超级母题战略题库.pdf'
    build_pdf(out_pdf)
