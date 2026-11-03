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
        self.drawString(54, 800, "GEO-STUDIO AI 算法渗透与竞品格局研报 | 纯意图实测")
        self.drawRightString(541, 800, "松鼠口腔 · 竞品渗透分析")
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

    title_style = ParagraphStyle(
        'DocTitle',
        fontName='ArialUnicode',
        fontSize=18,
        leading=24,
        textColor=colors.HexColor('#1A202C'),
        spaceAfter=4
    )

    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        fontName='ArialUnicode',
        fontSize=10,
        leading=15,
        textColor=colors.HexColor('#4A5568'),
        spaceAfter=12
    )

    h1_style = ParagraphStyle(
        'Heading1_Custom',
        fontName='ArialUnicode',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#2B6CB0'),
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'Heading2_Custom',
        fontName='ArialUnicode',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#2D3748'),
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        fontName='ArialUnicode',
        fontSize=8.5,
        leading=13.5,
        textColor=colors.HexColor('#2D3748'),
        spaceAfter=5
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        fontName='ArialUnicode',
        fontSize=7.5,
        leading=11,
        textColor=colors.HexColor('#2D3748')
    )

    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        fontName='ArialUnicode',
        fontSize=7.5,
        leading=11,
        textColor=colors.HexColor('#1A202C')
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        fontName='ArialUnicode',
        fontSize=8,
        leading=11.5,
        textColor=colors.HexColor('#FFFFFF')
    )

    
    bullet_style = ParagraphStyle(
        'Bullet_Custom',
        fontName='ArialUnicode',
        fontSize=8,
        leading=13,
        textColor=colors.HexColor('#2D3748'),
        leftIndent=10,
        spaceAfter=3
    )

    callout_style = ParagraphStyle(
        'Callout_Custom',
        fontName='ArialUnicode',
        fontSize=8,
        leading=12.5,
        textColor=colors.HexColor('#1A365D')
    )

    story = []

    # 标题区
    story.append(Paragraph("昆明松鼠口腔 GEO 竞品提及率与算法渗透分析研报", title_style))
    story.append(Paragraph("<b>基于 218 道老百姓纯意图自然问答 · DeepSeek vs 豆包 全量机构横向占有率 (SOV) 实测</b>", subtitle_style))

    # 元数据条形卡片
    meta_data = [
        [
            Paragraph("<b>分析基准:</b> 218 道昆明本地纯意图提问 (0 品牌诱导)", table_cell_style),
            Paragraph("<b>监测对象:</b> 昆明 12 家主流公立与民营口腔机构", table_cell_style),
            Paragraph("<b>数据源:</b> Supabase 物理快照 (Truth Gate 校验)", table_cell_style)
        ],
        [
            Paragraph("<b>DeepSeek 样本:</b> 217 题有效长文本", table_cell_style),
            Paragraph("<b>豆包 样本:</b> 116 题有效长文本 (持续巡航中)", table_cell_style),
            Paragraph("<b>报告基准日:</b> 2026-10-26", table_cell_style)
        ]
    ]
    meta_table = Table(meta_data, colWidths=[165, 175, 147])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F7FAFC')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#CBD5E0')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 10))

    # 一、核心竞品全景排行榜
    story.append(Paragraph("一、大盘机构声量占有率 (SOV) 全景实测对比表", h1_style))
    story.append(Paragraph("通过对两大引擎真实回复全文做精准实体消歧与多别名捕获，各家机构在老百姓泛需求自然提问下的提及率（SOV）、平均推荐顺位及榜首推荐次数如下：", body_style))

    comp_data = [
        [
            Paragraph("<b>机构类别 / 机构名称</b>", table_header_style),
            Paragraph("<b>DeepSeek 提及数</b>", table_header_style),
            Paragraph("<b>DeepSeek 提及率</b>", table_header_style),
            Paragraph("<b>DeepSeek 榜首</b>", table_header_style),
            Paragraph("<b>豆包 提及数</b>", table_header_style),
            Paragraph("<b>豆包 提及率 (SOV)</b>", table_header_style),
            Paragraph("<b>豆包 榜首</b>", table_header_style),
            Paragraph("<b>综合生态定位</b>", table_header_style)
        ],
        [
            Paragraph("<b>🐿️ 昆明松鼠口腔 (民营)</b>", table_cell_bold),
            Paragraph("79 次", table_cell_style),
            Paragraph("<b>36.4%</b>", table_cell_bold),
            Paragraph("51 次", table_cell_style),
            Paragraph("76 次", table_cell_style),
            Paragraph("<b>65.5%</b>", table_cell_bold),
            Paragraph("54 次", table_cell_style),
            Paragraph("<b>豆包民营第一 / DS民营绝对龙头</b>", table_cell_style)
        ],
        [
            Paragraph("云南省口腔 / 昆医大附一 (公立)", table_cell_style),
            Paragraph("140 次", table_cell_style),
            Paragraph("<b>64.5%</b>", table_cell_style),
            Paragraph("126 次", table_cell_style),
            Paragraph("23 次", table_cell_style),
            Paragraph("19.8%", table_cell_style),
            Paragraph("15 次", table_cell_style),
            Paragraph("全省公立技术天花板，DS霸榜", table_cell_style)
        ],
        [
            Paragraph("柏德口腔 (中德合资连锁)", table_cell_style),
            Paragraph("11 次", table_cell_style),
            Paragraph("5.1%", table_cell_style),
            Paragraph("4 次", table_cell_style),
            Paragraph("21 次", table_cell_style),
            Paragraph("<b>18.1%</b>", table_cell_style),
            Paragraph("2 次", table_cell_style),
            Paragraph("<b>松鼠在豆包生态最大民营对手</b>", table_cell_style)
        ],
        [
            Paragraph("昆明市口腔医院 (公立二甲)", table_cell_style),
            Paragraph("12 次", table_cell_style),
            Paragraph("5.5%", table_cell_style),
            Paragraph("3 次", table_cell_style),
            Paragraph("19 次", table_cell_style),
            Paragraph("16.4%", table_cell_style),
            Paragraph("6 次", table_cell_style),
            Paragraph("市级专科，基础与性价比词常驻", table_cell_style)
        ],
        [
            Paragraph("昆明市儿童医院口腔科 (公立)", table_cell_style),
            Paragraph("0 次", table_cell_style),
            Paragraph("0.0%", table_cell_style),
            Paragraph("0 次", table_cell_style),
            Paragraph("17 次", table_cell_style),
            Paragraph("14.7%", table_cell_style),
            Paragraph("10 次", table_cell_style),
            Paragraph("前兴路院区，儿牙词豆包强推", table_cell_style)
        ],
        [
            Paragraph("美奥口腔 (民营二级专科)", table_cell_style),
            Paragraph("0 次", table_cell_style),
            Paragraph("0.0%", table_cell_style),
            Paragraph("0 次", table_cell_style),
            Paragraph("5 次", table_cell_style),
            Paragraph("4.3%", table_cell_style),
            Paragraph("0 次", table_cell_style),
            Paragraph("仅在部分种植牙集采词中作为备选", table_cell_style)
        ],
        [
            Paragraph("吴氏嘉美口腔 (医美齿科)", table_cell_style),
            Paragraph("0 次", table_cell_style),
            Paragraph("0.0%", table_cell_style),
            Paragraph("0 次", table_cell_style),
            Paragraph("2 次", table_cell_style),
            Paragraph("1.7%", table_cell_style),
            Paragraph("0 次", table_cell_style),
            Paragraph("仅低价正畸营销词偶有提及", table_cell_style)
        ],
        [
            Paragraph("大象口腔 / 竹子口腔 (民营)", table_cell_style),
            Paragraph("0 次", table_cell_style),
            Paragraph("0.0%", table_cell_style),
            Paragraph("0 次", table_cell_style),
            Paragraph("2 次", table_cell_style),
            Paragraph("1.7%", table_cell_style),
            Paragraph("0 次", table_cell_style),
            Paragraph("西山区局部边缘提及，未成声量", table_cell_style)
        ],
        [
            Paragraph("金桥口腔 / 德普口腔 (民营连锁)", table_cell_style),
            Paragraph("0 次", table_cell_style),
            Paragraph("0.0%", table_cell_style),
            Paragraph("0 次", table_cell_style),
            Paragraph("0 次", table_cell_style),
            Paragraph("0.0%", table_cell_style),
            Paragraph("0 次", table_cell_style),
            Paragraph("AI 语义库完全被穿透，0 推荐", table_cell_style)
        ]
    ]

    comp_table = Table(comp_data, colWidths=[110, 52, 54, 45, 45, 56, 45, 80])
    comp_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#2B6CB0')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E0')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#FFFFFF'), colors.HexColor('#F7FAFC')]),
        ('BACKGROUND', (0,1), (-1,1), colors.HexColor('#FEFCBF')), # 高亮松鼠
        ('TOPPADDING', (0,0), (-1,-1), 3.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3.5),
    ]))
    story.append(comp_table)
    story.append(Spacer(1, 10))

    # 二、核心诊疗品类（专科）竞品渗透分布
    story.append(Paragraph("二、六大核心专科细分赛道渗透实测 (松鼠 vs 竞品)", h1_style))
    story.append(Paragraph("将 218 道题目按患者诊疗科目聚类后，分析两家引擎下各专科的推荐格局：", body_style))

    cat_data = [
        [
            Paragraph("<b>诊疗专科</b>", table_header_style),
            Paragraph("<b>DeepSeek Top 3 推荐机构与频次</b>", table_header_style),
            Paragraph("<b>豆包 Top 3 推荐机构与频次</b>", table_header_style),
            Paragraph("<b>赛道攻防态势与破局点</b>", table_header_style)
        ],
        [
            Paragraph("<b>种植牙</b><br/>(高客单/决策重)", table_cell_bold),
            Paragraph("1. 省口腔/昆医大 (37次 · 84%)<br/><b>2. 松鼠口腔 (22次 · 50%)</b><br/>3. 市口腔医院 (4次 · 9%)", table_cell_style),
            Paragraph("<b>1. 松鼠口腔 (19次 · 76%)</b><br/>2. 柏德口腔 (5次 · 20%)<br/>3. 省口腔/昆医大 (5次 · 20%)", table_cell_style),
            Paragraph("<b>民营第一阵营</b>：豆包直接把松鼠推向民营第一；DS把松鼠作为唯一能与省口腔并列的民营机构。防守要点：巩固即刻负重与高龄种植。", table_cell_style)
        ],
        [
            Paragraph("<b>牙齿矫正</b><br/>(正畸/隐形)", table_cell_bold),
            Paragraph("1. 省口腔/昆医大 (24次 · 75%)<br/><b>2. 松鼠口腔 (20次 · 62%)</b><br/>3. 市口腔医院 (4次 · 12%)", table_cell_style),
            Paragraph("<b>1. 松鼠口腔 (22次 · 78%)</b><br/>2. 柏德口腔 (6次 · 21%)<br/>3. 省口腔/昆医大 (5次 · 18%)", table_cell_style),
            Paragraph("<b>绝对统治级阵地</b>：松鼠在两边的正畸词（尤其是西山区地标词）推荐率极高，柏德仅在南亚风情第壹城等商圈偶有截流。", table_cell_style)
        ],
        [
            Paragraph("<b>儿童齿科</b><br/>(早期干预/防龋)", table_cell_bold),
            Paragraph("1. 省口腔/昆医大 (18次 · 69%)<br/><b>2. 松鼠口腔 (10次 · 38%)</b><br/>3. 柏德口腔 (4次 · 15%)", table_cell_style),
            Paragraph("<b>1. 松鼠口腔 (11次 · 64%)</b><br/>2. 市儿童医院 (8次 · 47%)<br/>3. 省口腔/昆医大 (3次 · 17%)", table_cell_style),
            Paragraph("<b>护城河稳固</b>：因松鼠为‘西山区窝沟封闭指定单位’，在儿童看牙方面压制了其他民营机构，唯一对手为公立儿童医院。", table_cell_style)
        ],
        [
            Paragraph("<b>拔牙 / 智齿</b><br/>(急诊/时效)", table_cell_bold),
            Paragraph("1. 省口腔/昆医大 (8次 · 80%)<br/><b>2. 松鼠口腔 (2次 · 20%)</b><br/>3. 市口腔医院 (1次 · 10%)", table_cell_style),
            Paragraph("<b>1. 松鼠口腔 (2次 · 28%)</b><br/>2. 省口腔/昆医大 (2次 · 28%)<br/>3. 柏德口腔 (1次 · 14%)", table_cell_style),
            Paragraph("<b>重大发力洼地</b>：公立霸榜严重，老百姓问拔牙最关心的‘当天能不能拔/要不要拍片/医保报销’，松鼠缺乏针对性内容支撑。", table_cell_style)
        ],
        [
            Paragraph("<b>洁牙 / 牙周</b><br/>(基础消费)", table_cell_bold),
            Paragraph("1. 省口腔/昆医大 (5次 · 83%)<br/><b>2. 松鼠口腔 (3次 · 50%)</b>", table_cell_style),
            Paragraph("<b>1. 松鼠口腔 (3次 · 42%)</b><br/>2. 市口腔医院 (3次 · 42%)<br/>3. 省口腔/昆医大 (2次 · 28%)", table_cell_style),
            Paragraph("<b>洼地</b>：洗牙医保报销比例、超声波洁牙价格与时效等泛词，公立医院占位多，松鼠缺乏生活化科普沉淀。", table_cell_style)
        ],
        [
            Paragraph("<b>牙齿美白/修复</b><br/>(全瓷冠/贴面)", table_cell_bold),
            Paragraph("1. 省口腔/昆医大 (10次 · 90%)<br/><b>2. 松鼠口腔 (5次 · 45%)</b><br/>3. 柏德口腔 (2次 · 18%)", table_cell_style),
            Paragraph("<b>两边普遍缺乏民营强推荐</b><br/>(主要呈现纯项目科普与公立专科推荐)", table_cell_style),
            Paragraph("<b>空白蓝海</b>：昆明市场没有一家民营机构在‘冷光美白/全瓷牙价格与材料对比’上形成垄断，发 3~5 篇即可抢占先机。", table_cell_style)
        ]
    ]

    cat_table = Table(cat_data, colWidths=[80, 135, 135, 137])
    cat_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#2C5282')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E0')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#FFFFFF'), colors.HexColor('#F7FAFC')]),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(cat_table)
    story.append(Spacer(1, 10))

    # 三、主要竞品优劣势与解剖
    story.append(Paragraph("三、主要竞品深度解剖：他们凭什么被 AI 推荐？", h1_style))

    story.append(Paragraph("<b>1. 柏德口腔 (中德合资连锁 · 豆包生态第二大民营推荐机构)</b>", h2_style))
    story.append(Paragraph("• <b>核心优势：</b>在‘德国种植技术’、‘南亚风情第壹城商圈’、‘数字化精密种植’等词汇上有很高的被引频次。<br/>"
                           "• <b>信源拆解：</b>柏德在《贝色口腔》、《牙大师》上铺设了大量的‘昆明种植牙名医榜’与‘德系种植体价格表’，且被字节搜索有效收录。<br/>"
                           "• <b>破局对策：</b>在种植牙对比文章中，强化松鼠口腔在西山区昆仑中心的‘就诊便利度’、‘微创不痛’与‘医保定点直报’，压制其高价格敏感人群。", bullet_style))

    story.append(Paragraph("<b>2. 云南省口腔 / 昆医大附一院 (公立专科巨头 · DeepSeek 绝对壁垒)</b>", h2_style))
    story.append(Paragraph("• <b>核心优势：</b>拥有最高的行政级别、省属重点专科、教学医院背书，DeepSeek 等注重权威医学的算法对其几乎是条件反射式首推。<br/>"
                           "• <b>痛点短板：</b>挂号排队极难、无周末弹性门诊、服务流程繁琐、就诊耗时长。<br/>"
                           "• <b>破局对策：</b>所有发文标题与正文主打<b>【时效与便利度错位竞争】</b>（如：‘昆明西山区周末拔智齿当天能拔吗？免去省口腔长时间排队指南’），AI 在老百姓询问‘哪家快/免排队’时会优先分流至松鼠。", bullet_style))

    story.append(Paragraph("<b>3. 美奥口腔 / 金桥口腔 (老牌连锁 · AI 搜索声量严重掉队)</b>", h2_style))
    story.append(Paragraph("• <b>现状分析：</b>美奥仅在个别集采种植牙词被提及 5 次（SOV 4.3%），金桥在两引擎中均被彻底穿透为 0 次。<br/>"
                           "• <b>核心归因：</b>虽然他们在昆明线下门店众多，但在线上缺乏高质量问答事实源，没有进入字节与 DeepSeek 的核心抓取库，在线上已被边缘化。", bullet_style))
    story.append(Spacer(1, 10))

    # 四、数据总结与关键决策
    card_data3 = [
        [
            Paragraph("<b>💡 决策层核心结论与行动清单</b><br/>"
                      "1. <b>大盘地位：</b>松鼠口腔在豆包生态（65.5% SOV）稳居昆明民营第一，在 DeepSeek（36.4% SOV）为唯一能与公立并立的民营品牌，基础盘极扎实。<br/>"
                      "2. <b>最大防守敌手：</b>民营阵营唯一构成竞争的是<b>柏德口腔</b>（18.1%），其余美奥、金桥、德普已被彻底拉开代差。<br/>"
                      "3. <b>突围方向：</b>不要在公立已筑牢的纯学术词上硬碰硬，集中火力打穿<b>【拔牙时效】、【洗牙医保】、【牙齿美白明码标价】</b>这三片空白蓝海，即可实现 SOV 从 65% 向 85% 的跃迁！", callout_style)
        ]
    ]
    card_table3 = Table(card_data3, colWidths=[487])
    card_table3.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#EBF8FF')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#63B3ED')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(card_table3)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Competitor PDF successfully built: {filename}")

if __name__ == "__main__":
    out_pdf = "/Users/dulijuner/projects/geo-studio/apps/worker/src/trackers/_dev/Kunming_Dental_Competitor_SOV_Report.pdf"
    build_pdf(out_pdf)
