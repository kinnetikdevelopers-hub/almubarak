import { useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';

interface Payment {
  full_name: string;
  unit_number?: string;
  amount: number;
  status: string;
  mpesa_code?: string;
  notes?: string;
  created_at?: string;
}

interface PDFGeneratorProps {
  contentRef?: React.RefObject<HTMLDivElement>;
  fileName?: string;
  disabled?: boolean;
  // New structured data props
  reportData?: {
    monthLabel: string;
    stats: {
      totalExpected: number;
      totalCollected: number;
      totalPending: number;
      collectionRate: number;
    };
    payments: Payment[];
  };
}

const PDFGenerator = ({
  fileName = 'financial-report',
  disabled = false,
  reportData,
}: PDFGeneratorProps) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePDF = async () => {
    if (!reportData) return;
    setIsGenerating(true);

    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      const primaryColor: [number, number, number] = [30, 64, 175]; // blue-800
      const lightGray: [number, number, number] = [248, 249, 250];
      const darkGray: [number, number, number] = [55, 65, 81];
      const green: [number, number, number] = [16, 185, 129];
      const yellow: [number, number, number] = [245, 158, 11];
      const red: [number, number, number] = [239, 68, 68];

      // ── Header bar ──────────────────────────────────────────────
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, pageWidth, 28, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Al-Mubarak Estate', margin, 12);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Financial Report', margin, 20);

      // Date top right
      doc.setFontSize(9);
      const today = new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' });
      doc.text(`Generated: ${today}`, pageWidth - margin, 12, { align: 'right' });
      doc.text(`Period: ${reportData.monthLabel}`, pageWidth - margin, 20, { align: 'right' });

      // ── Summary section title ────────────────────────────────────
      let y = 38;
      doc.setTextColor(...darkGray);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Summary', margin, y);

      // Horizontal rule
      y += 3;
      doc.setDrawColor(...primaryColor);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y);
      y += 6;

      // ── 4 stat boxes ─────────────────────────────────────────────
      const boxW = (pageWidth - margin * 2 - 9) / 4;
      const boxH = 24;
      const boxes = [
        { label: 'Expected Rent', value: `KES ${reportData.stats.totalExpected.toLocaleString()}`, color: primaryColor },
        { label: 'Collected', value: `KES ${reportData.stats.totalCollected.toLocaleString()}`, color: green },
        { label: 'Pending', value: `KES ${reportData.stats.totalPending.toLocaleString()}`, color: yellow },
        { label: 'Collection Rate', value: `${reportData.stats.collectionRate.toFixed(1)}%`, color: reportData.stats.collectionRate >= 80 ? green : yellow },
      ];

      boxes.forEach((box, i) => {
        const x = margin + i * (boxW + 3);
        // Box bg
        doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
        doc.roundedRect(x, y, boxW, boxH, 2, 2, 'F');
        // Left accent bar
        doc.setFillColor(...box.color);
        doc.roundedRect(x, y, 3, boxH, 1, 1, 'F');
        // Label
        doc.setTextColor(120, 120, 120);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.text(box.label, x + 6, y + 8);
        // Value
        doc.setTextColor(...box.color);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(box.value, x + 6, y + 18);
      });

      y += boxH + 10;

      // ── Collection rate bar ──────────────────────────────────────
      doc.setTextColor(...darkGray);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Collection Progress: ${reportData.stats.collectionRate.toFixed(1)}%`, margin, y);
      y += 4;
      // Track
      doc.setFillColor(220, 220, 220);
      doc.roundedRect(margin, y, pageWidth - margin * 2, 4, 2, 2, 'F');
      // Fill
      const fillW = Math.min(((pageWidth - margin * 2) * reportData.stats.collectionRate) / 100, pageWidth - margin * 2);
      doc.setFillColor(...green);
      doc.roundedRect(margin, y, fillW, 4, 2, 2, 'F');
      y += 12;

      // ── Payment details table ────────────────────────────────────
      doc.setTextColor(...darkGray);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Payment Details', margin, y);
      y += 3;
      doc.setDrawColor(...primaryColor);
      doc.line(margin, y, pageWidth - margin, y);
      y += 4;

      const tableRows = reportData.payments.map((p) => [
        p.full_name || '—',
        p.unit_number || '—',
        `KES ${(p.amount || 0).toLocaleString()}`,
        p.status.charAt(0).toUpperCase() + p.status.slice(1),
        p.mpesa_code || p.notes || '—',
        p.created_at ? new Date(p.created_at).toLocaleDateString('en-KE') : '—',
      ]);

      autoTable(doc, {
        startY: y,
        head: [['Tenant', 'Unit', 'Amount', 'Status', 'Reference', 'Date']],
        body: tableRows.length > 0 ? tableRows : [['No payments recorded', '', '', '', '', '']],
        margin: { left: margin, right: margin },
        styles: {
          fontSize: 8.5,
          cellPadding: 3,
          textColor: darkGray,
        },
        headStyles: {
          fillColor: primaryColor,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.5,
        },
        alternateRowStyles: {
          fillColor: lightGray,
        },
        columnStyles: {
          2: { halign: 'right' },
          3: {
            fontStyle: 'bold',
          },
        },
        didParseCell: (data) => {
          if (data.column.index === 3 && data.section === 'body') {
            const val = String(data.cell.raw).toLowerCase();
            if (val === 'paid') data.cell.styles.textColor = green;
            else if (val === 'pending') data.cell.styles.textColor = yellow;
            else if (val === 'overdue') data.cell.styles.textColor = red;
          }
        },
      });

      // ── Footer on every page ─────────────────────────────────────
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFillColor(245, 245, 245);
        doc.rect(0, pageHeight - 10, pageWidth, 10, 'F');
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.text('Al-Mubarak Estate — Confidential', margin, pageHeight - 4);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 4, { align: 'right' });
      }

      doc.save(`${fileName}-${reportData.monthLabel.replace(/\s/g, '-')}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button onClick={generatePDF} disabled={disabled || isGenerating} variant="outline">
      {isGenerating ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Download className="h-4 w-4 mr-2" />
      )}
      {isGenerating ? 'Generating PDF...' : 'Download PDF'}
    </Button>
  );
};

export default PDFGenerator;