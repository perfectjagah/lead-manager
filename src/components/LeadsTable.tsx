// src/components/LeadsTable.tsx
import React, { useEffect, useState, useCallback } from "react";
import { Table, Select, Row, Col, Button, Space, message } from "antd";
import { fetchLeads, fetchStatuses, fetchUsers } from "../services/api";
import type { Lead } from "../types";
import { EyeOutlined } from "@ant-design/icons";

const { Option } = Select;

interface LeadsTableProps {
  onLeadClick: (lead: Lead) => void;
  onReady?: (reloadFn: () => Promise<void>) => void;
}

export const LeadsTable: React.FC<LeadsTableProps> = ({
  onLeadClick,
  onReady,
}) => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [salesMembers, setSalesMembers] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [assignedFilter, setAssignedFilter] = useState<string | null>(null);

  const loadStatuses = useCallback(async () => {
    try {
      const res = await fetchStatuses();
      if (res.success && res.data) setStatuses(res.data as any[]);
    } catch (err) {
      // ignore
    }
  }, []);

  const loadSalesMembers = useCallback(async () => {
    try {
      const res = await fetchUsers();
      if (res.success && res.data) {
        const sales = (res.data as any[]).filter((u) => u.role === "SalesTeam");
        setSalesMembers(sales);
      }
    } catch (err) {
      // ignore
    }
  }, []);

  const loadLeads = useCallback(
    async (p = page, ps = pageSize) => {
      setLoading(true);
      try {
        const res = await fetchLeads(p, ps);
        if (res.success && res.data) {
          let arr = res.data.leads || [];
          // Apply client-side filters for status and assigned person
          if (statusFilter) {
            arr = arr.filter(
              (l) => String(l.statusId) === String(statusFilter)
            );
          }
          if (assignedFilter) {
            arr = arr.filter(
              (l) =>
                l.assignedTo &&
                String(l.assignedTo.id) === String(assignedFilter)
            );
          }
          setLeads(arr);
          setTotal(
            typeof res.data.total === "number" ? res.data.total : arr.length
          );
          setPage(res.data.page || p);
          setPageSize(res.data.pageSize || ps);
        } else {
          message.error(res.error || "Failed to load leads");
        }
      } catch (err) {
        message.error("Failed to load leads");
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, statusFilter, assignedFilter]
  );

  // expose reload
  useEffect(() => {
    if (onReady) onReady(() => loadLeads(1, pageSize));
  }, [onReady, loadLeads, pageSize]);

  useEffect(() => {
    loadStatuses();
    loadSalesMembers();
  }, [loadStatuses, loadSalesMembers]);

  useEffect(() => {
    // load first page
    loadLeads(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, assignedFilter]);

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (text: string, record: Lead) => (
        <a onClick={() => onLeadClick(record)}>{text}</a>
      ),
      sorter: (a: Lead, b: Lead) => a.name.localeCompare(b.name),
    },
    {
      title: "Contact",
      dataIndex: "phone",
      key: "phone",
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      filters: statuses.map((s) => ({ text: s.name, value: String(s.id) })),
      onFilter: (value: any, record: Lead) => {
        return String(record.statusId) === String(value);
      },
      render: (_val: any, rec: Lead) => rec.status || String(rec.statusId),
    },
    {
      title: "Assigned To",
      dataIndex: "assignedTo",
      key: "assignedTo",
      filters: salesMembers.map((m) => ({ text: m.name, value: String(m.id) })),
      onFilter: (value: any, record: Lead) => {
        return !!(
          record.assignedTo && String(record.assignedTo.id) === String(value)
        );
      },
      render: (_val: any, rec: Lead) => rec.assignedTo?.name || "-",
    },
    {
      title: "Lead Date",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (val: string) => new Date(val).toLocaleString(),
      sorter: (a: Lead, b: Lead) =>
        (new Date(a.createdAt).getTime() || 0) -
        (new Date(b.createdAt).getTime() || 0),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: any, rec: Lead) => (
        <Space>
          <Button icon={<EyeOutlined />} onClick={() => onLeadClick(rec)} />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm={8} md={6}>
          <Select
            allowClear
            placeholder="Filter by status"
            style={{ width: "100%" }}
            value={statusFilter || undefined}
            onChange={(val) => setStatusFilter(val || null)}
          >
            {statuses.map((s) => (
              <Option key={s.id} value={String(s.id)}>
                {s.name}
              </Option>
            ))}
          </Select>
        </Col>
        <Col xs={24} sm={8} md={6}>
          <Select
            allowClear
            placeholder="Filter by sales person"
            style={{ width: "100%" }}
            value={assignedFilter || undefined}
            onChange={(val) => setAssignedFilter(val || null)}
          >
            {salesMembers.map((m) => (
              <Option key={m.id} value={String(m.id)}>
                {m.name}
              </Option>
            ))}
          </Select>
        </Col>
        <Col xs={24} sm={8} md={12} style={{ textAlign: "right" }}>
          <Button
            onClick={() => {
              setStatusFilter(null);
              setAssignedFilter(null);
              loadLeads(1, pageSize);
            }}
          >
            Clear Filters
          </Button>
        </Col>
      </Row>

      <Table
        rowKey={(r: Lead) => r.id}
        dataSource={leads}
        columns={columns}
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps || pageSize);
            loadLeads(p, ps || pageSize);
          },
        }}
      />
    </div>
  );
};
