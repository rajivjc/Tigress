// =============================================================================
// Payroll — payslip PDF renderer (Session 27b)
// =============================================================================
// Renders a payslip PDF using @react-pdf/renderer. Server-side only.
//
// Layout philosophy: deliberately simple. No custom fonts (default sans
// serif keeps bundle weight off), no images other than the optional logo,
// no per-page footers. One staff section per page; multi-staff PDFs are N
// pages of the same component. Layout matches the on-screen staff payslip
// view as closely as plain text components allow.
//
// Snapshot caveat: PDFs include non-deterministic CreationDate / ModDate
// metadata, so a byte-stream snapshot test would be fragile across
// `@react-pdf/renderer` versions. See package.json — the renderer version
// is pinned (^4.x compatibility range only). Tests for this module assert
// the output is a valid PDF byte stream and contains the expected text;
// they do not snapshot the binary.
// =============================================================================

import "server-only";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  renderToBuffer,
} from "@react-pdf/renderer";
import type {
  PayslipDocument,
  PayslipStaffSection,
} from "./payslip-transformer";

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111111",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
    borderBottom: "1pt solid #999999",
    paddingBottom: 12,
  },
  venueBlock: {
    flexDirection: "column",
  },
  venueName: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  venueLine: {
    fontSize: 9,
    color: "#444444",
  },
  logo: {
    width: 64,
    height: 64,
    objectFit: "contain",
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: "bold",
  },
  subTitle: {
    fontSize: 10,
    color: "#444444",
  },
  staffBlock: {
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  staffName: {
    fontSize: 12,
    fontWeight: "bold",
  },
  staffMeta: {
    fontSize: 9,
    color: "#444444",
  },
  table: {
    marginTop: 8,
    border: "1pt solid #cccccc",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    borderBottom: "1pt solid #cccccc",
    padding: 4,
    fontWeight: "bold",
    fontSize: 9,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "1pt solid #eeeeee",
    padding: 4,
    fontSize: 9,
  },
  colKind: {
    width: "15%",
  },
  colLabel: {
    width: "40%",
  },
  colHours: {
    width: "10%",
    textAlign: "right",
  },
  colRate: {
    width: "15%",
    textAlign: "right",
  },
  colAmount: {
    width: "20%",
    textAlign: "right",
  },
  totalsBlock: {
    marginTop: 16,
    alignItems: "flex-end",
  },
  totalsRow: {
    flexDirection: "row",
    width: 240,
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  totalsLabel: {
    fontSize: 10,
  },
  totalsValue: {
    fontSize: 10,
    textAlign: "right",
  },
  netRow: {
    flexDirection: "row",
    width: 240,
    justifyContent: "space-between",
    paddingVertical: 4,
    marginTop: 4,
    borderTop: "1pt solid #999999",
  },
  netLabel: {
    fontSize: 12,
    fontWeight: "bold",
  },
  netValue: {
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "right",
  },
  footer: {
    marginTop: 24,
    fontSize: 8,
    color: "#666666",
    textAlign: "center",
  },
});

function fmtAmount(n: number, currency: string): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}${currency} ${Math.abs(n).toFixed(2)}`;
}

function fmtNum(n: number | null): string {
  if (n === null) return "";
  return n.toFixed(2);
}

function PayslipPage(props: {
  doc: PayslipDocument;
  section: PayslipStaffSection;
}) {
  const { doc, section } = props;
  const currency = doc.run.currency;

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <View style={styles.venueBlock}>
          <Text style={styles.venueName}>{doc.venue.name || "Venue"}</Text>
          {doc.venue.address ? (
            <Text style={styles.venueLine}>{doc.venue.address}</Text>
          ) : null}
          {doc.venue.contact_email ? (
            <Text style={styles.venueLine}>{doc.venue.contact_email}</Text>
          ) : null}
          {doc.venue.contact_phone ? (
            <Text style={styles.venueLine}>{doc.venue.contact_phone}</Text>
          ) : null}
        </View>
        {doc.venue.logo_url ? (
          // react-pdf's <Image> renders into a PDF, not the DOM — the
          // jsx-a11y/alt-text rule doesn't apply.
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={doc.venue.logo_url} style={styles.logo} />
        ) : null}
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.title}>
          Payslip — {doc.run.period_start} to {doc.run.period_end}
        </Text>
        <Text style={styles.subTitle}>
          Payment date: {doc.run.payment_date}
        </Text>
      </View>

      <View style={styles.staffBlock}>
        <View>
          <Text style={styles.staffName}>{section.full_name}</Text>
          <Text style={styles.staffMeta}>Employee ID: {section.staff_id}</Text>
        </View>
        <View>
          <Text style={styles.staffMeta}>
            Status: {doc.run.status.toUpperCase()}
          </Text>
          <Text style={styles.staffMeta}>Currency: {currency}</Text>
        </View>
      </View>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={styles.colKind}>Kind</Text>
          <Text style={styles.colLabel}>Description</Text>
          <Text style={styles.colHours}>Hours</Text>
          <Text style={styles.colRate}>Rate</Text>
          <Text style={styles.colAmount}>Amount</Text>
        </View>
        {section.line_items.map((item) => (
          <View key={item.id} style={styles.tableRow}>
            <Text style={styles.colKind}>{item.kind}</Text>
            <Text style={styles.colLabel}>{item.label}</Text>
            <Text style={styles.colHours}>{fmtNum(item.hours)}</Text>
            <Text style={styles.colRate}>
              {item.rate_applied !== null ? item.rate_applied.toFixed(2) : ""}
            </Text>
            <Text style={styles.colAmount}>
              {fmtAmount(item.amount, currency)}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.totalsBlock}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Gross</Text>
          <Text style={styles.totalsValue}>
            {fmtAmount(section.totals.gross, currency)}
          </Text>
        </View>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Deductions</Text>
          <Text style={styles.totalsValue}>
            {fmtAmount(section.totals.deductions_total, currency)}
          </Text>
        </View>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Statutory</Text>
          <Text style={styles.totalsValue}>
            {fmtAmount(section.totals.statutory_total, currency)}
          </Text>
        </View>
        <View style={styles.netRow}>
          <Text style={styles.netLabel}>Net</Text>
          <Text style={styles.netValue}>
            {fmtAmount(section.totals.net, currency)}
          </Text>
        </View>
      </View>

      <Text style={styles.footer}>
        {doc.run.locked_at
          ? `Locked ${doc.run.locked_at} by ${doc.run.locked_by_name}.`
          : `Status: ${doc.run.status}.`}{" "}
        Format v{doc.metadata.format_version}. Generated{" "}
        {doc.metadata.exported_at} by {doc.metadata.exported_by}.
      </Text>
    </Page>
  );
}

export function PayslipPdfDocument(props: { doc: PayslipDocument }) {
  const { doc } = props;
  return (
    <Document>
      {doc.staff.map((section) => (
        <PayslipPage key={section.staff_id} doc={doc} section={section} />
      ))}
    </Document>
  );
}

/**
 * Render a payslip document to a PDF byte buffer. Multi-staff documents
 * produce a multi-page PDF (one page per staff section). Single-staff
 * documents (filtered via `filterPayslipToStaff`) produce a single-page
 * PDF — that's the path the staff payslip download uses.
 */
export async function renderPayslipPdf(
  doc: PayslipDocument
): Promise<Buffer> {
  return renderToBuffer(<PayslipPdfDocument doc={doc} />);
}
