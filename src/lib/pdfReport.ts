import { jsPDF } from 'jspdf';
import { types, type SurveyAnalysis, type SurveySummary } from './research';
import type {
  ExtractedKeyword,
  QuestionDistribution,
  TimelinePoint,
} from './surveyAnalytics';

export interface PdfChartSvgs {
  bar?: SVGSVGElement | null;
  donut?: SVGSVGElement | null;
  keyword?: SVGSVGElement | null;
  timeline?: SVGSVGElement | null;
  activeQuestionLabel?: string;
}

export interface ExportSurveyPdfInput {
  summary: SurveySummary;
  distributions: QuestionDistribution[];
  keywords: ExtractedKeyword[];
  timeline: TimelinePoint[];
  overallScaleAvg: number | null;
  aiAnalysis?: SurveyAnalysis;
  chartSvgs: PdfChartSvgs;
}

const PAGE_W = 1240;
const PAGE_H = 1754; // A4 ratio (210 x 297)
const MARGIN_X = 72;
const MARGIN_TOP = 84;
const MARGIN_BOTTOM = 76;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const FONT_STACK =
  '"Pretendard Variable", "Pretendard", "Plus Jakarta Sans", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

async function svgToImage(svgEl: SVGSVGElement | null | undefined): Promise<{ img: HTMLImageElement; w: number; h: number } | null> {
  if (!svgEl) return null;
  const rect = svgEl.getBoundingClientRect();
  const attrW = Number(svgEl.getAttribute('width')) || Math.round(rect.width) || 480;
  const attrH = Number(svgEl.getAttribute('height')) || Math.round(rect.height) || 260;

  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(attrW));
  clone.setAttribute('height', String(attrH));
  clone.setAttribute('font-family', FONT_STACK);

  // Hide any interactive hover tooltip groups inside cloned SVG
  clone.querySelectorAll('g[pointer-events="none"]').forEach((node) => {
    node.setAttribute('opacity', '0');
  });

  const serialized = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('SVG 이미지 변환에 실패했어요.'));
      image.src = url;
    });
    return { img, w: attrW, h: attrH };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill?: string,
  stroke?: string,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.replace(/\r/g, '').split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const ch of para) {
      const next = current + ch;
      if (ctx.measureText(next).width > maxWidth && current.length > 0) {
        lines.push(current.trimEnd());
        current = ch === ' ' ? '' : ch;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current.trimEnd());
  }
  return lines;
}

class PaginatedReportCanvas {
  pages: HTMLCanvasElement[] = [];
  ctx!: CanvasRenderingContext2D;
  y = MARGIN_TOP;
  private reportTitle: string;

  constructor(reportTitle: string) {
    this.reportTitle = reportTitle;
    this.newPage();
  }

  newPage() {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('리포트 캔버스를 초기화할 수 없어요.');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    // Subtle running header on subsequent pages
    if (this.pages.length > 0) {
      ctx.font = `600 18px ${FONT_STACK}`;
      ctx.fillStyle = '#62627a';
      ctx.fillText(`리서치랩 · ${this.reportTitle}`, MARGIN_X, 50);
      ctx.strokeStyle = '#e9e7f1';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(MARGIN_X, 64);
      ctx.lineTo(PAGE_W - MARGIN_X, 64);
      ctx.stroke();
      this.y = MARGIN_TOP + 12;
    } else {
      this.y = MARGIN_TOP;
    }

    this.pages.push(canvas);
    this.ctx = ctx;
  }

  ensureSpace(height: number) {
    if (this.y + height > PAGE_H - MARGIN_BOTTOM) {
      this.newPage();
    }
  }

  drawSectionTitle(title: string, subtitle?: string) {
    this.ensureSpace(subtitle ? 74 : 46);
    this.ctx.font = `800 26px ${FONT_STACK}`;
    this.ctx.fillStyle = '#22213a';
    this.ctx.fillText(title, MARGIN_X, this.y + 24);
    this.y += 34;
    if (subtitle) {
      this.ctx.font = `400 19px ${FONT_STACK}`;
      this.ctx.fillStyle = '#62627a';
      this.ctx.fillText(subtitle, MARGIN_X, this.y + 18);
      this.y += 30;
    }
    this.y += 8;
  }

  finalizeFooters(exportedAt: string) {
    const total = this.pages.length;
    this.pages.forEach((canvas, idx) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.strokeStyle = '#efedf6';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(MARGIN_X, PAGE_H - 52);
      ctx.lineTo(PAGE_W - MARGIN_X, PAGE_H - 52);
      ctx.stroke();

      ctx.font = `500 17px ${FONT_STACK}`;
      ctx.fillStyle = '#62627a';
      ctx.fillText(`리서치랩 설문 분석 리포트 · 생성일 ${exportedAt}`, MARGIN_X, PAGE_H - 26);
      const pageLabel = `${idx + 1} / ${total}`;
      const labelW = ctx.measureText(pageLabel).width;
      ctx.fillText(pageLabel, PAGE_W - MARGIN_X - labelW, PAGE_H - 26);
    });
  }
}

export async function exportSurveyPdfReport(input: ExportSurveyPdfInput): Promise<string> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.ready;
    } catch {
      // Proceed even if fonts readiness rejects
    }
  }

  const { summary, distributions, keywords, timeline, overallScaleAvg, aiAnalysis, chartSvgs } = input;
  const now = new Date();
  const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  const timeStamp = `${dateStamp} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const [barImg, donutImg, keywordImg, timelineImg] = await Promise.all([
    svgToImage(chartSvgs.bar),
    svgToImage(chartSvgs.donut),
    svgToImage(chartSvgs.keyword),
    svgToImage(chartSvgs.timeline),
  ]);

  const doc = new PaginatedReportCanvas(summary.title);
  const ctx = () => doc.ctx;

  // 1. Cover Header Banner
  drawRoundedRect(ctx(), MARGIN_X, doc.y, CONTENT_W, 154, 18, '#f6f3ff', '#e2d5fd');
  ctx().font = `700 18px ${FONT_STACK}`;
  ctx().fillStyle = '#4d30cf';
  ctx().fillText('리서치랩 · 설문 데이터 분석 리포트', MARGIN_X + 28, doc.y + 38);

  ctx().font = `800 34px ${FONT_STACK}`;
  ctx().fillStyle = '#22213a';
  const titleLines = wrapTextLines(ctx(), summary.title, CONTENT_W - 56).slice(0, 2);
  titleLines.forEach((line, idx) => {
    ctx().fillText(line, MARGIN_X + 28, doc.y + 82 + idx * 38);
  });

  ctx().font = `500 18px ${FONT_STACK}`;
  ctx().fillStyle = '#62627a';
  ctx().fillText(
    `${summary.active ? '응답 접수 중' : '접수 종료'} · 총 응답 ${summary.count}건 · ${summary.questions.length}문항 · 출력 ${timeStamp}`,
    MARGIN_X + 28,
    doc.y + 132,
  );
  doc.y += 178;

  // 2. KPI Summary Strip (4 cards)
  const kpiGap = 16;
  const kpiW = (CONTENT_W - kpiGap * 3) / 4;
  const kpiH = 108;
  const kpis = [
    {
      label: '총 수집 응답',
      value: `${summary.count}건`,
      sub: summary.active ? '접수 중' : '접수 종료',
      accent: '#22213a',
    },
    {
      label: '문항 구성',
      value: `${summary.questions.length}문항`,
      sub: `객관 ${summary.questions.filter((q) => q.type === 'choice').length} · 척도 ${
        summary.questions.filter((q) => q.type === 'scale').length
      } · 서술 ${summary.questions.filter((q) => q.type === 'text').length}`,
      accent: '#22213a',
    },
    {
      label: '5점 척도 평균',
      value: overallScaleAvg !== null ? `${overallScaleAvg.toFixed(2)} / 5.0` : '—',
      sub: overallScaleAvg !== null ? '전체 척도 문항 평균' : '척도 문항 없음',
      accent: '#5b3df5',
    },
    {
      label: '최다 언급 키워드',
      value: keywords[0]?.word ? (keywords[0].word.length > 9 ? `${keywords[0].word.slice(0, 8)}…` : keywords[0].word) : '—',
      sub: keywords.length ? `${keywords.length}개 추출 · 최다 ${keywords[0].count}회` : '텍스트 응답 없음',
      accent: '#22213a',
    },
  ];

  kpis.forEach((kpi, idx) => {
    const x = MARGIN_X + idx * (kpiW + kpiGap);
    drawRoundedRect(ctx(), x, doc.y, kpiW, kpiH, 14, '#ffffff', '#e9e7f1');
    ctx().font = `600 17px ${FONT_STACK}`;
    ctx().fillStyle = '#62627a';
    ctx().fillText(kpi.label, x + 20, doc.y + 32);

    ctx().font = `800 28px ${FONT_STACK}`;
    ctx().fillStyle = kpi.accent;
    ctx().fillText(kpi.value, x + 20, doc.y + 68);

    ctx().font = `500 15px ${FONT_STACK}`;
    ctx().fillStyle = '#62627a';
    ctx().fillText(kpi.sub, x + 20, doc.y + 92);
  });
  doc.y += kpiH + 28;

  // 3. Embedded D3 Charts (Active Question Distribution: Bar + Donut)
  if (barImg || donutImg) {
    doc.drawSectionTitle(
      '1. 대표 문항 응답 분포 차트',
      chartSvgs.activeQuestionLabel ? `선택 문항: ${chartSvgs.activeQuestionLabel}` : undefined,
    );
    const boxH = 320;
    doc.ensureSpace(boxH + 20);
    const leftW = donutImg ? Math.round(CONTENT_W * 0.58) : CONTENT_W;
    const rightW = CONTENT_W - leftW - 18;

    if (barImg) {
      drawRoundedRect(ctx(), MARGIN_X, doc.y, leftW, boxH, 14, '#ffffff', '#e9e7f1');
      const pad = 18;
      const scale = Math.min((leftW - pad * 2) / barImg.w, (boxH - pad * 2) / barImg.h);
      const dw = barImg.w * scale;
      const dh = barImg.h * scale;
      ctx().drawImage(barImg.img, MARGIN_X + (leftW - dw) / 2, doc.y + (boxH - dh) / 2, dw, dh);
    }

    if (donutImg) {
      const rx = MARGIN_X + leftW + 18;
      drawRoundedRect(ctx(), rx, doc.y, rightW, boxH, 14, '#faf9fd', '#e9e7f1');
      const pad = 18;
      const scale = Math.min((rightW - pad * 2) / donutImg.w, (boxH - pad * 2) / donutImg.h);
      const dw = donutImg.w * scale;
      const dh = donutImg.h * scale;
      ctx().drawImage(donutImg.img, rx + (rightW - dw) / 2, doc.y + 18, dw, dh);

      // Draw concise legend below donut if space permits
      const activeDist = distributions.find((d) =>
        chartSvgs.activeQuestionLabel?.includes(d.label),
      ) ?? distributions[0];
      if (activeDist) {
        let ly = doc.y + dh + 36;
        ctx().font = `600 15px ${FONT_STACK}`;
        activeDist.buckets.slice(0, 4).forEach((b) => {
          if (ly < doc.y + boxH - 12) {
            ctx().fillStyle = '#22213a';
            ctx().fillText(`• ${b.label}: ${b.count}건 (${b.pct}%)`, rx + 22, ly);
            ly += 22;
          }
        });
      }
    }
    doc.y += boxH + 28;
  }

  // 4. Embedded D3 Charts (Keyword Extraction + Timeline)
  if (keywordImg || timelineImg) {
    doc.drawSectionTitle('2. 키워드 추출 및 시간별 응답 추이 차트');
    const chartH = 350;
    doc.ensureSpace(chartH + 24);
    const halfGap = 18;
    const halfW = (CONTENT_W - halfGap) / 2;

    if (keywordImg) {
      drawRoundedRect(ctx(), MARGIN_X, doc.y, halfW, chartH, 14, '#ffffff', '#e9e7f1');
      ctx().font = `700 18px ${FONT_STACK}`;
      ctx().fillStyle = '#22213a';
      ctx().fillText('추출 키워드 시각화 (D3)', MARGIN_X + 20, doc.y + 32);

      const availW = halfW - 32;
      const availH = chartH - 54;
      const scale = Math.min(availW / keywordImg.w, availH / keywordImg.h);
      const dw = keywordImg.w * scale;
      const dh = keywordImg.h * scale;
      ctx().drawImage(keywordImg.img, MARGIN_X + (halfW - dw) / 2, doc.y + 44 + (availH - dh) / 2, dw, dh);
    }

    if (timelineImg) {
      const tx = keywordImg ? MARGIN_X + halfW + halfGap : MARGIN_X;
      const tw = keywordImg ? halfW : CONTENT_W;
      drawRoundedRect(ctx(), tx, doc.y, tw, chartH, 14, '#ffffff', '#e9e7f1');
      ctx().font = `700 18px ${FONT_STACK}`;
      ctx().fillStyle = '#22213a';
      ctx().fillText('시간별 응답 수집 추이 (D3)', tx + 20, doc.y + 32);

      const availW = tw - 32;
      const availH = chartH - 74;
      const scale = Math.min(availW / timelineImg.w, availH / timelineImg.h);
      const dw = timelineImg.w * scale;
      const dh = timelineImg.h * scale;
      ctx().drawImage(timelineImg.img, tx + (tw - dw) / 2, doc.y + 48, dw, dh);

      if (timeline.length > 0) {
        const last = timeline[timeline.length - 1];
        ctx().font = `500 15px ${FONT_STACK}`;
        ctx().fillStyle = '#62627a';
        ctx().fillText(`최근 구간(${last.label}) 누적 응답 ${last.cumulative}건`, tx + 20, doc.y + chartH - 18);
      }
    }
    doc.y += chartH + 28;
  }

  // 5. AI Deep Analysis Summary (if generated)
  if (aiAnalysis) {
    doc.drawSectionTitle('3. AI 응답 심층 분석 요약');
    ctx().font = `400 19px ${FONT_STACK}`;
    const overviewLines = wrapTextLines(ctx(), aiAnalysis.overview, CONTENT_W - 44);
    const findingLines = aiAnalysis.keyFindings.flatMap((f) => wrapTextLines(ctx(), `• ${f}`, CONTENT_W - 44));
    const signalLines = aiAnalysis.segmentSignals.flatMap((s) => wrapTextLines(ctx(), `• ${s}`, CONTENT_W - 44));
    const recLines = aiAnalysis.recommendations.flatMap((r) => wrapTextLines(ctx(), `• ${r}`, CONTENT_W - 44));

    const totalLines = overviewLines.length + findingLines.length + signalLines.length + recLines.length;
    const cardH = totalLines * 27 + 150;
    doc.ensureSpace(Math.min(cardH, 520));

    const startY = doc.y;
    const boxStart = startY;
    // Draw sections sequentially with automatic overflow protection
    const writeSubBlock = (heading: string, lines: string[], accent = '#4d30cf') => {
      const needed = 34 + lines.length * 26 + 14;
      doc.ensureSpace(needed);
      drawRoundedRect(ctx(), MARGIN_X, doc.y, CONTENT_W, needed - 6, 12, '#faf7ff', '#e2d5fd');
      ctx().font = `700 18px ${FONT_STACK}`;
      ctx().fillStyle = accent;
      ctx().fillText(heading, MARGIN_X + 20, doc.y + 28);
      ctx().font = `400 18px ${FONT_STACK}`;
      ctx().fillStyle = '#22213a';
      lines.forEach((line, idx) => {
        ctx().fillText(line, MARGIN_X + 20, doc.y + 56 + idx * 26);
      });
      doc.y += needed + 8;
    };

    if (boxStart > 0) {
      writeSubBlock('전체 경향 요약', overviewLines);
      if (findingLines.length) writeSubBlock('핵심 발견 사항', findingLines);
      if (signalLines.length) writeSubBlock('타겟 유저 세그먼트 신호', signalLines);
      if (recLines.length) writeSubBlock('후속 실행 제안', recLines);
    }
    doc.y += 12;
  }

  // 6. Extracted Keywords Table
  if (keywords.length > 0) {
    const sectionNum = aiAnalysis ? '4' : '3';
    doc.drawSectionTitle(`${sectionNum}. 주요 추출 키워드 순위`);
    const topKw = keywords.slice(0, 10);
    const rowH = 44;
    doc.ensureSpace(48 + topKw.length * rowH + 20);

    // Table header
    drawRoundedRect(ctx(), MARGIN_X, doc.y, CONTENT_W, 40, 8, '#f8f8fc', '#e9e7f1');
    ctx().font = `700 17px ${FONT_STACK}`;
    ctx().fillStyle = '#565771';
    ctx().fillText('순위', MARGIN_X + 20, doc.y + 26);
    ctx().fillText('키워드', MARGIN_X + 100, doc.y + 26);
    ctx().fillText('언급 빈도', MARGIN_X + 320, doc.y + 26);
    ctx().fillText('감성 신호', MARGIN_X + 450, doc.y + 26);
    ctx().fillText('관련 응답 예시', MARGIN_X + 600, doc.y + 26);
    doc.y += 44;

    topKw.forEach((kw, idx) => {
      doc.ensureSpace(rowH);
      drawRoundedRect(ctx(), MARGIN_X, doc.y, CONTENT_W, rowH - 4, 6, '#ffffff', '#efedf6');
      ctx().font = `600 17px ${FONT_STACK}`;
      ctx().fillStyle = '#62627a';
      ctx().fillText(`#${idx + 1}`, MARGIN_X + 20, doc.y + 26);

      ctx().font = `700 18px ${FONT_STACK}`;
      ctx().fillStyle = '#22213a';
      ctx().fillText(kw.word, MARGIN_X + 100, doc.y + 26);

      ctx().font = `700 17px ${FONT_STACK}`;
      ctx().fillStyle = '#5b3df5';
      ctx().fillText(`${kw.count}회`, MARGIN_X + 320, doc.y + 26);

      ctx().font = `700 16px ${FONT_STACK}`;
      ctx().fillStyle =
        kw.sentiment === '긍정' ? '#14674d' : kw.sentiment === '개선요청' ? '#9a2148' : '#4d30cf';
      ctx().fillText(kw.sentiment, MARGIN_X + 450, doc.y + 26);

      ctx().font = `400 16px ${FONT_STACK}`;
      ctx().fillStyle = '#62627a';
      const quote = kw.sampleQuotes[0] ? (kw.sampleQuotes[0].length > 34 ? `${kw.sampleQuotes[0].slice(0, 33)}…` : kw.sampleQuotes[0]) : '—';
      ctx().fillText(quote, MARGIN_X + 600, doc.y + 26);

      doc.y += rowH;
    });
    doc.y += 24;
  }

  // 7. Full Question-by-Question Distribution Summary
  const distSectionNum = aiAnalysis ? (keywords.length ? '5' : '4') : keywords.length ? '4' : '3';
  doc.drawSectionTitle(`${distSectionNum}. 전체 문항별 응답 요약`);

  for (const dist of distributions) {
    const isText = dist.type === 'text';
    const samples = (dist.textSamples ?? []).slice(0, 5);
    const barRows = isText ? samples.length : dist.buckets.length;
    const estH = 74 + Math.max(1, barRows) * 34 + 24;
    doc.ensureSpace(Math.min(estH, 420));

    ctx().font = `700 20px ${FONT_STACK}`;
    const qTitleLines = wrapTextLines(ctx(), `Q${dist.questionIndex + 1}. ${dist.label}`, CONTENT_W - 40);
    const blockH = 44 + qTitleLines.length * 26 + Math.max(1, barRows) * 34 + 20;
    doc.ensureSpace(blockH);

    drawRoundedRect(ctx(), MARGIN_X, doc.y, CONTENT_W, blockH, 12, '#ffffff', '#e9e7f1');
    let curY = doc.y + 28;

    ctx().font = `700 19px ${FONT_STACK}`;
    ctx().fillStyle = '#22213a';
    qTitleLines.forEach((line) => {
      ctx().fillText(line, MARGIN_X + 20, curY);
      curY += 26;
    });

    ctx().font = `600 15px ${FONT_STACK}`;
    ctx().fillStyle = '#4d30cf';
    const meta = `${types[dist.type]} · 응답 ${dist.answeredCount}/${dist.totalCount}건${
      dist.type === 'scale' && dist.averageScore ? ` · 평균 ${dist.averageScore.toFixed(2)}점` : ''
    }`;
    ctx().fillText(meta, MARGIN_X + 20, curY + 2);
    curY += 26;

    if (isText) {
      ctx().font = `400 16px ${FONT_STACK}`;
      if (!samples.length) {
        ctx().fillStyle = '#62627a';
        ctx().fillText('작성된 서술형 응답이 없습니다.', MARGIN_X + 20, curY + 6);
      } else {
        samples.forEach((ans) => {
          const single = ans.replace(/\s+/g, ' ').trim();
          const clipped = single.length > 68 ? `${single.slice(0, 67)}…` : single;
          ctx().fillStyle = '#22213a';
          ctx().fillText(`• ${clipped}`, MARGIN_X + 20, curY + 6);
          curY += 32;
        });
      }
    } else {
      const barAreaX = MARGIN_X + 280;
      const barMaxW = CONTENT_W - 440;
      dist.buckets.forEach((b, bIdx) => {
        ctx().font = `600 16px ${FONT_STACK}`;
        ctx().fillStyle = '#22213a';
        const lbl = b.label.length > 16 ? `${b.label.slice(0, 15)}…` : b.label;
        ctx().fillText(lbl, MARGIN_X + 20, curY + 12);

        drawRoundedRect(ctx(), barAreaX, curY - 2, barMaxW, 18, 6, '#f2f0f9');
        const fillW = b.pct > 0 ? Math.max(10, Math.round((barMaxW * b.pct) / 100)) : 0;
        if (fillW > 0) {
          const colors = ['#5b3df5', '#4a7fd9', '#1f8a65', '#d97724', '#a6214e'];
          drawRoundedRect(ctx(), barAreaX, curY - 2, fillW, 18, 6, colors[bIdx % colors.length]);
        }

        ctx().font = `700 16px ${FONT_STACK}`;
        ctx().fillStyle = '#22213a';
        ctx().fillText(`${b.count}건 (${b.pct}%)`, barAreaX + barMaxW + 18, curY + 12);
        curY += 34;
      });
    }

    doc.y += blockH + 16;
  }

  doc.finalizeFooters(timeStamp);

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  doc.pages.forEach((canvas, idx) => {
    if (idx > 0) pdf.addPage('a4', 'portrait');
    const imgData = canvas.toDataURL('image/jpeg', 0.94);
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  });

  const safeTitle = summary.title.replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 32) || '설문-리포트';
  const fileName = `${safeTitle}-분석리포트-${dateStamp}.pdf`;
  pdf.save(fileName);
  return fileName;
}
