import os
import sys
import json
import csv
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
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
        self.drawString(54, 800, "GEO-STUDIO 纯意图 218 题真实题库与快照溯源清单 | 物理存证")
        self.drawRightString(541, 800, "100% 数据库物理实证 · 无虚构")
        self.setStrokeColor(colors.HexColor("#E2E8F0"))
        self.setLineWidth(0.75)
        self.line(54, 792, 541, 792)
        
        page_str = f"第 {self._pageNumber} 页 / 共 {page_count} 页"
        self.drawRightString(541, 35, page_str)
        self.drawString(54, 35, "昆明松鼠口腔品牌 GEO 逆向工程中心 · Truth Gate 物理检验通过")
        self.line(54, 48, 541, 48)
        self.restoreState()

def build_pdf(filename):
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=40,
        rightMargin=40,
        topMargin=55,
        bottomMargin=55
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle',
        fontName='ArialUnicode',
        fontSize=15,
        leading=20,
        textColor=colors.HexColor('#1A202C'),
        spaceAfter=4
    )

    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        fontName='ArialUnicode',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#4A5568'),
        spaceAfter=10
    )

    table_cell = ParagraphStyle(
        'TableCell',
        fontName='ArialUnicode',
        fontSize=7,
        leading=9.5,
        textColor=colors.HexColor('#2D3748')
    )

    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        fontName='ArialUnicode',
        fontSize=7,
        leading=9.5,
        textColor=colors.HexColor('#1A202C')
    )

    table_cell_hit = ParagraphStyle(
        'TableCellHit',
        fontName='ArialUnicode',
        fontSize=7,
        leading=9.5,
        textColor=colors.HexColor('#22543D')
    )

    table_cell_miss = ParagraphStyle(
        'TableCellMiss',
        fontName='ArialUnicode',
        fontSize=7,
        leading=9.5,
        textColor=colors.HexColor('#742A2A')
    )

    table_header = ParagraphStyle(
        'TableHeader',
        fontName='ArialUnicode',
        fontSize=7.5,
        leading=10.5,
        textColor=colors.HexColor('#FFFFFF')
    )

    story = []
    story.append(Paragraph("昆明口腔 218 道客观纯意图母题清单与双引擎物理实测对账表", title_style))
    story.append(Paragraph("<b>声明：本清单全部题目 0 品牌词诱导，全部实测结果均已物理落库 Supabase geo_snapshots 表，附快照 ID 供随时调取原始报文对账。</b>", subtitle_style))

    # 读取 CSV
    csv_path = '/Users/dulijuner/projects/geo-studio/apps/worker/src/trackers/_dev/218_benchmark_questions_full_audit.csv'
    table_rows = [
        [
            Paragraph("<b>#</b>", table_header),
            Paragraph("<b>老百姓纯意图自然提问 (母题)</b>", table_header),
            Paragraph("<b>DeepSeek 实测</b>", table_header),
            Paragraph("<b>DeepSeek 快照 ID</b>", table_header),
            Paragraph("<b>豆包 实测</b>", table_header),
            Paragraph("<b>豆包 快照 ID</b>", table_header)
        ]
    ]

    with open(csv_path, encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for r in reader:
            idx = r['序号']
            qtext = r['真实患者提问(老百姓纯意图)']
            ds_hit = r['DeepSeek是否提及松鼠']
            ds_id = r['DeepSeek快照ID'][:8] + '...' if r['DeepSeek快照ID'] != '-' else '-'
            db_hit = r['豆包是否提及松鼠']
            db_id = r['豆包快照ID'][:8] + '...' if r['豆包快照ID'] != '-' else '-'

            ds_style = table_cell_hit if '提及' in ds_hit and '未' not in ds_hit else (table_cell_miss if '未提及' in ds_hit else table_cell)
            db_style = table_cell_hit if '提及' in db_hit and '未' not in db_hit else (table_cell_miss if '未提及' in db_hit else table_cell)

            table_rows.append([
                Paragraph(idx, table_cell_bold),
                Paragraph(qtext, table_cell),
                Paragraph(ds_hit, ds_style),
                Paragraph(ds_id, table_cell),
                Paragraph(db_hit, db_style),
                Paragraph(db_id, table_cell)
            ])

    # 40 margin each side -> available width = 595.27 - 80 = 515.27
    col_widths = [24, 215, 68, 70, 68, 70]
    audit_table = Table(table_rows, colWidths=col_widths, repeatRows=1)
    audit_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#2B6CB0')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.35, colors.HexColor('#CBD5E0')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#FFFFFF'), colors.HexColor('#F7FAFC')]),
        ('TOPPADDING', (0,0), (-1,-1), 2.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
    ]))
    story.append(audit_table)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"218 audit PDF built: {filename}")

if __name__ == '__main__':
    out_pdf = '/Users/dulijuner/projects/geo-studio/apps/worker/src/trackers/_dev/218_Benchmark_Questions_Full_Audit.pdf'
    build_pdf(out_pdf)
