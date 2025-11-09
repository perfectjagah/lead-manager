import React, { useState } from "react";
import { Upload, Button, Modal, Table, Alert, Progress } from "antd";
import { UploadOutlined, FileExcelOutlined } from "@ant-design/icons";
import { RcFile } from "antd/es/upload";
import { importLeads } from "../services/api";

interface CSVRow {
  id?: string;
  createdAt: string;
  ad_name: string;
  adset_name: string;
  form_name: string;
  full_name: string;
  phone_number: string;
  email: string;
  // dynamic question field header (exact header text)
  questionHeader?: string;
  // value for that question for this row
  questionValue?: string;
  // keep original row map for debugging/extension
  raw?: Record<string, string>;
}

interface CSVImportProps {
  onImportComplete: () => void;
}

export const CSVImport: React.FC<CSVImportProps> = ({ onImportComplete }) => {
  const [previewData, setPreviewData] = useState<CSVRow[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const columns = [
    { title: "ID", dataIndex: "id" },
    { title: "Created At", dataIndex: "createdAt" },
    { title: "Ad Name", dataIndex: "ad_name" },
    { title: "Adset Name", dataIndex: "adset_name" },
    { title: "Form Name", dataIndex: "form_name" },
    { title: "Full Name", dataIndex: "full_name" },
    { title: "Phone", dataIndex: "phone_number" },
    { title: "Email", dataIndex: "email" },
    { title: "Question", dataIndex: "questionValue" },
  ];

  const parseCSV = (file: RcFile): Promise<CSVRow[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;

          // Split into lines and detect delimiter (tab or comma)
          const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
          if (lines.length === 0) {
            resolve([]);
            return;
          }

          const firstLine = lines[0];
          const delimiter = firstLine.includes("\t") ? "\t" : ",";

          const rawHeaders = firstLine.split(delimiter).map((h) => h.trim());
          const headers = rawHeaders.map((h) => h.toLowerCase());

          // Find the dynamic question header - prefer header that contains '?' else fallback to column M (index 12)
          let questionIndex = headers.findIndex((h) => h.includes("?"));
          if (questionIndex === -1 && rawHeaders.length > 12)
            questionIndex = 12;

          // Find id header if present (common header names)
          const idHeaderIndex = headers.findIndex((h) =>
            ["id", "lead id", "lead_id", "leadid"].includes(h)
          );

          // Helper to split a line by delimiter and trim quotes
          const splitLine = (line: string) =>
            line.split(delimiter).map((c) => c.replace(/^"|"$/g, "").trim());

          const data: CSVRow[] = [];
          for (let i = 1; i < lines.length; i++) {
            const cols = splitLine(lines[i]);
            // Build map of header -> value
            const rowMap: Record<string, string> = {};
            rawHeaders.forEach((h, idx) => {
              rowMap[h] = cols[idx] || "";
            });

            const createdAt =
              rowMap[rawHeaders[1]] || rowMap["created_time"] || "";
            const id =
              idHeaderIndex >= 0
                ? rowMap[rawHeaders[idHeaderIndex]] || ""
                : undefined;
            const ad_name = rowMap[rawHeaders[3]] || rowMap["ad_name"] || "";
            const adset_name =
              rowMap[rawHeaders[5]] || rowMap["adset_name"] || "";
            const form_name =
              rowMap[rawHeaders[9]] || rowMap["form_name"] || "";
            const full_name =
              rowMap["full_name"] || rowMap[rawHeaders[13]] || "";
            const phone_number =
              rowMap["phone_number"] || rowMap[rawHeaders[14]] || "";
            const email = rowMap["email"] || rowMap[rawHeaders[15]] || "";

            const questionHeader =
              questionIndex >= 0 ? rawHeaders[questionIndex] : undefined;
            const questionValue =
              questionIndex >= 0 ? cols[questionIndex] || "" : undefined;

            // Skip very empty rows
            if (!createdAt && !full_name && !email && !phone_number) continue;

            data.push({
              id,
              createdAt,
              ad_name,
              adset_name,
              form_name,
              full_name,
              phone_number,
              email,
              questionHeader,
              questionValue,
              raw: rowMap,
            });
          }

          resolve(data);
        } catch (error) {
          reject("Failed to parse CSV file");
        }
      };

      reader.onerror = () => reject("Failed to read file");
      reader.readAsText(file);
    });
  };

  const handleFileUpload = async (file: RcFile) => {
    try {
      setError(null);
      const data = await parseCSV(file);
      setPreviewData(data);
      setShowPreview(true);
    } catch (error) {
      setError(error as string);
    }
    return false; // Prevent automatic upload
  };

  const handleImport = async () => {
    setImporting(true);
    setImportProgress(0);

    try {
      const batchSize = 100;
      // Fetch existing leads to avoid duplicates (check by id)
      const existingResp = await import("../services/api").then((m) =>
        (m as any).fetchLeads(1, Math.max(previewData.length * 2, 1000))
      );
      let existingIds = new Set<string>();
      try {
        if (existingResp && existingResp.success && existingResp.data) {
          const existingLeads = existingResp.data.leads || [];
          existingLeads.forEach((l: any) => {
            if (l.id) existingIds.add(String(l.id));
          });
        }
      } catch (e) {
        // ignore and proceed
      }

      // Map previewData to backend shape expected by importLeads
      const mapped = previewData.map((r) => {
        const extra: Record<string, string> = {};
        if (r.questionHeader) extra[r.questionHeader] = r.questionValue || "";

        return {
          id: r.id,
          name: r.full_name,
          email: r.email,
          phone: r.phone_number,
          createdAt: r.createdAt,
          adName: r.ad_name,
          adsetName: r.adset_name,
          formName: r.form_name,
          extraFields: extra,
          // default statusId to 1 for all imported leads
          statusId: "1",
        } as Partial<any>;
      });

      // Filter out duplicates where incoming row has an id that already exists
      const toInsert = mapped.filter((m) => {
        if (m.id && existingIds.has(String(m.id))) return false;
        return true;
      });

      const skippedCount = mapped.length - toInsert.length;

      // If nothing to insert after deduplication, inform the user and exit
      if (toInsert.length === 0) {
        Modal.info({
          title: "Nothing to import",
          content:
            skippedCount > 0
              ? `All ${skippedCount} rows were duplicates and were skipped.`
              : "No new rows to import.",
        });
        setShowPreview(false);
        onImportComplete();
        return;
      }

      const batches: (typeof mapped)[] = [];
      for (let i = 0; i < toInsert.length; i += batchSize) {
        batches.push(toInsert.slice(i, i + batchSize));
      }

      let importedCount = 0;
      for (const batch of batches) {
        const response = await importLeads(batch as any);
        if (!response.success) {
          throw new Error("Import failed");
        }
        importedCount += batch.length;
        setImportProgress(Math.round((importedCount / toInsert.length) * 100));
      }

      Modal.success({
        title: "Import Complete",
        content:
          "Successfully imported " +
          importedCount +
          " leads" +
          (skippedCount > 0 ? ` (skipped ${skippedCount} duplicate IDs)` : ""),
      });
      setShowPreview(false);
      onImportComplete();
    } catch (error) {
      setError("Failed to import leads");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <Upload
        accept=".csv"
        beforeUpload={handleFileUpload}
        showUploadList={false}
      >
        <Button icon={<UploadOutlined />}>Select CSV File</Button>
      </Upload>

      {error && (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          style={{ marginTop: 16 }}
        />
      )}

      <Modal
        title="Preview Import Data"
        open={showPreview}
        onCancel={() => setShowPreview(false)}
        width={800}
        footer={[
          <Button key="cancel" onClick={() => setShowPreview(false)}>
            Cancel
          </Button>,
          <Button
            key="import"
            type="primary"
            onClick={handleImport}
            loading={importing}
            icon={<FileExcelOutlined />}
          >
            Import {previewData.length} Leads
          </Button>,
        ]}
      >
        {importing && (
          <div style={{ marginBottom: 16 }}>
            <Progress percent={importProgress} />
          </div>
        )}
        <Table
          dataSource={previewData}
          columns={columns}
          size="small"
          scroll={{ y: 400 }}
          rowKey={(row) =>
            row.id
              ? String(row.id)
              : (row.email || "") + "-" + (row.phone_number || "")
          }
        />
      </Modal>
    </div>
  );
};
